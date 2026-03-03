const express = require('express');
const { execSync } = require('child_process');
const router = express.Router();

// Parse a cron "0 21 * * 4" into the next occurrence
function getNextCronRun(cron) {
  const parts = cron.trim().split(/\s+/);
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);
  const dayOfWeek = parseInt(parts[4], 10); // 0=Sun, 4=Thu

  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(hour, minute, 0, 0);

  // Find next occurrence of this day-of-week
  const currentDay = now.getUTCDay();
  let daysAhead = dayOfWeek - currentDay;
  if (daysAhead < 0) daysAhead += 7;
  if (daysAhead === 0 && now >= next) daysAhead = 7;

  next.setUTCDate(next.getUTCDate() + daysAhead);
  return next.toISOString();
}

router.get('/runs', (req, res) => {
  try {
    // 1. Fetch workflow YAML to get the cron schedule dynamically
    let cron = '0 21 * * 4'; // fallback
    try {
      const yamlB64 = execSync(
        "gh api repos/bh679/weekly-blog/contents/.github/workflows/weekly-blog.yml --jq '.content'",
        { encoding: 'utf8', timeout: 15000 }
      );
      const yamlContent = Buffer.from(yamlB64.trim(), 'base64').toString('utf8');
      const cronMatch = yamlContent.match(/cron:\s*'([^']+)'/);
      if (cronMatch) cron = cronMatch[1];
    } catch (e) {
      console.error('Failed to fetch workflow YAML, using fallback cron:', e.message);
    }

    // 2. Fetch run history
    const runsJson = execSync(
      "gh run list --repo bh679/weekly-blog --workflow weekly-blog.yml --limit 20 --json databaseId,status,conclusion,event,createdAt,updatedAt,name,url",
      { encoding: 'utf8', timeout: 15000 }
    );
    const runs = JSON.parse(runsJson);

    // 3. For failed runs, fetch failure details
    const enrichedRuns = runs.map(run => {
      const created = new Date(run.createdAt);
      const updated = new Date(run.updatedAt);
      const durationMs = updated - created;
      const durationSec = Math.round(durationMs / 1000);
      const minutes = Math.floor(durationSec / 60);
      const seconds = durationSec % 60;
      const duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

      const result = {
        id: run.databaseId,
        status: run.status,
        conclusion: run.conclusion,
        event: run.event,
        createdAt: run.createdAt,
        duration,
        url: run.url
      };

      if (run.conclusion === 'failure') {
        try {
          const jobsJson = execSync(
            `gh run view ${run.databaseId} --repo bh679/weekly-blog --json jobs`,
            { encoding: 'utf8', timeout: 15000 }
          );
          const jobsData = JSON.parse(jobsJson);
          const failedSteps = [];
          for (const job of (jobsData.jobs || [])) {
            if (job.conclusion === 'failure') {
              for (const step of (job.steps || [])) {
                if (step.conclusion === 'failure') {
                  failedSteps.push(step.name);
                }
              }
            }
          }
          if (failedSteps.length > 0) {
            result.failureReason = failedSteps.join(', ');
          }
        } catch (e) {
          // Couldn't fetch failure details — that's ok
        }
      }

      return result;
    });

    res.json({
      schedule: {
        cron,
        nextRun: getNextCronRun(cron)
      },
      runs: enrichedRuns
    });
  } catch (err) {
    console.error('Failed to fetch blog runs:', err.message);
    res.status(500).json({ error: 'Failed to fetch blog runs', message: err.message });
  }
});

module.exports = router;
