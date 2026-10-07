-- =====================================================================
-- Veritas Daily: product analytics queries (PostHog SQL / HogQL)
-- Paste each query into PostHog > SQL editor (or an Insight of type SQL).
-- Events are sent by client/src/services/analytics.js; see README "Product analytics".
-- =====================================================================


-- 1. ACTIVATION FUNNEL
-- Of people who signed up in the last 30 days, how many reached each step
-- within 7 days of signing up? The biggest drop is the first thing to fix.
WITH signups AS (
    SELECT person_id, min(timestamp) AS signed_up_at
    FROM events
    WHERE event = 'signed_up' AND timestamp > now() - INTERVAL 30 DAY
    GROUP BY person_id
),
steps AS (
    SELECT
        s.person_id,
        countIf(e.event = 'onboarding_completed') > 0 AS onboarded,
        countIf(e.event = 'briefing_viewed') > 0      AS saw_briefing,
        countIf(e.event = 'quiz_completed') > 0       AS finished_check
    FROM signups AS s
    LEFT JOIN events AS e
        ON e.person_id = s.person_id
       AND e.timestamp BETWEEN s.signed_up_at AND s.signed_up_at + INTERVAL 7 DAY
    GROUP BY s.person_id
)
SELECT
    count()                                            AS signed_up,
    countIf(onboarded)                                 AS picked_topics,
    countIf(saw_briefing)                              AS saw_first_briefing,
    countIf(finished_check)                            AS finished_first_check,
    round(100 * countIf(finished_check) / count(), 1)  AS activation_rate_pct
FROM steps;


-- 2. NEXT-DAY RETENTION
-- Of people who opened their first briefing in the last 30 days,
-- what share came back the very next day?
SELECT
    count()                                       AS new_readers,
    countIf(came_back)                            AS came_back_next_day,
    round(100 * countIf(came_back) / count(), 1)  AS day_1_retention_pct
FROM (
    SELECT
        person_id,
        has(groupUniqArray(toDate(timestamp)), min(toDate(timestamp)) + 1) AS came_back
    FROM events
    WHERE event = 'briefing_viewed' AND timestamp > now() - INTERVAL 30 DAY
    GROUP BY person_id
);


-- 3. EXPERIMENT: credibility meter visible vs behind a tap
-- Flag key: briefing-credibility-display  (variants: visible = control, on-tap)
-- Question: does showing the score up front change how many people open stories
-- and finish the quick check? (PostHog adds $feature/<flag> to every event.)
SELECT
    properties.`$feature/briefing-credibility-display`                  AS variant,
    uniqIf(person_id, event = 'briefing_viewed')                         AS readers,
    uniqIf(person_id, event = 'story_opened')                            AS opened_a_story,
    uniqIf(person_id, event = 'quiz_completed')                          AS finished_check,
    round(100 * uniqIf(person_id, event = 'quiz_completed')
              / uniqIf(person_id, event = 'briefing_viewed'), 1)         AS finish_rate_pct
FROM events
WHERE event IN ('briefing_viewed', 'story_opened', 'quiz_completed')
  AND timestamp > now() - INTERVAL 30 DAY
  AND properties.`$feature/briefing-credibility-display` IS NOT NULL
GROUP BY variant
ORDER BY variant;


-- 4. FAKE-DOOR DEMAND FOR PRO
-- Where do people see the Pro prompt, and how many join the waitlist from each place?
SELECT
    properties.source                                           AS prompted_by,
    uniqIf(person_id, event = 'pro_cta_viewed')                 AS saw_prompt,
    uniqIf(person_id, event = 'pro_waitlist_joined')            AS joined_waitlist,
    round(100 * uniqIf(person_id, event = 'pro_waitlist_joined')
              / uniqIf(person_id, event = 'pro_cta_viewed'), 1) AS join_rate_pct
FROM events
WHERE event IN ('pro_cta_viewed', 'pro_waitlist_joined')
  AND timestamp > now() - INTERVAL 30 DAY
GROUP BY prompted_by
ORDER BY saw_prompt DESC;


-- 5. QUICK-CHECK DIFFICULTY
-- Share of correct answers by question position. If one position is far below
-- the others, questions there may be unfair (or answers may be leaking).
SELECT
    toInt(properties.index) + 1                         AS question_number,
    count()                                             AS answers,
    round(100 * countIf(properties.correct = true) / count(), 1) AS correct_pct
FROM events
WHERE event = 'quiz_answered' AND timestamp > now() - INTERVAL 30 DAY
GROUP BY question_number
ORDER BY question_number;
