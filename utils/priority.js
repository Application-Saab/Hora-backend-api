/**
 * Lead priority tags: which lead an agent should call next.
 * Backend JavaScript version of priority.ts
 */

const TAGS = [
  {
    key: 'callback', rank: 1, label: 'Callback due', tone: 'critical',
    actionable: true, sla: '15 min, or the time the customer asked for',
    rule: 'Customer asked for a call back on WhatsApp and nobody has spoken to them since.',
    action: 'Call now. The customer is expecting it.'
  },
  {
    key: 'hot', rank: 2, label: 'Hot · order summary', tone: 'hot',
    actionable: true, sla: '1 h after the summary, then daily',
    rule: 'Order summary sent, and no conversation since it was sent or in the last 24 h.',
    action: 'Call to confirm the order and close.'
  },
  {
    key: 'new', rank: 3, label: 'New lead', tone: 'new',
    actionable: true, sla: '5 min (overdue after 1 h)',
    rule: 'Lead has not been called yet.',
    action: 'Make the first call. Speed wins the lead.'
  },
  {
    key: 'event_soon', rank: 4, label: 'Event soon', tone: 'event',
    actionable: true, sla: 'Same day',
    rule: 'Event date is within 7 days and no conversation in the last 24 h.',
    action: 'Call today: the date is close.'
  },
  {
    key: 'warm', rank: 5, label: 'Warm · details shared', tone: 'warm',
    actionable: true, sla: '4 h',
    rule: 'Event details shared, no order summary yet, and no conversation since (or in 24 h).',
    action: 'Call to suggest a package and send the order summary.'
  },
  {
    key: 'retry', rank: 6, label: 'Retry', tone: 'neutral',
    actionable: true, sla: 'Next best calling hour',
    rule: 'Never answered, fewer than 3 attempts, last attempt 3+ h ago.',
    action: 'Try again.'
  },
  {
    key: 'follow_up', rank: 7, label: 'Follow-up', tone: 'neutral',
    actionable: true, sla: 'Every 2–3 days',
    rule: 'Spoke before, no conversation for 48 h.',
    action: 'Check in and move the lead forward.'
  },
  {
    key: 'unreachable', rank: 8, label: 'Not reachable', tone: 'muted',
    actionable: true, sla: '1 call a day',
    rule: '3+ calls, never answered.',
    action: 'Send a WhatsApp message, then call once a day.'
  },
  {
    key: 'cold', rank: 9, label: 'Cold', tone: 'muted',
    actionable: true, sla: 'Weekly; close after 3 weeks',
    rule: 'No conversation for 7+ days and no event date.',
    action: 'Light check-in, or close the lead.'
  },
  {
    key: 'scheduled', rank: 10, label: 'Callback scheduled', tone: 'muted',
    actionable: false, sla: 'At the agreed time',
    rule: 'Customer asked to be called at a later time.',
    action: 'Call at the agreed time.'
  },
  {
    key: 'waiting', rank: 11, label: 'Recently contacted', tone: 'muted',
    actionable: false, sla: '—',
    rule: 'Called very recently, or already 3 calls today.',
    action: 'Nothing to do now.'
  },
  {
    key: 'closed', rank: 12, label: 'Closed', tone: 'muted',
    actionable: false, sla: '—',
    rule: 'Converted, lost, or the event date has passed.',
    action: 'No calls needed.'
  }
];

const TAG_BY_KEY = Object.fromEntries(
  TAGS.map(tag => [tag.key, tag])
);

const DEFAULT_PRIORITY_RULES = {
  tzOffsetMinutes: 330,
  holdMinutes: 120,
  callbackRetryMinutes: 15,
  callbackLeadMinutes: 10,
  newOverdueMinutes: 60,
  recontactHours: 24,
  eventSoonDays: 7,
  retryAfterHours: 3,
  maxBlindAttempts: 3,
  followUpHours: 48,
  coldDays: 7,
  maxAttemptsPerDay: 3,
  meaningfulSeconds: 120,
  dayStartHour: 10
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const CLOSED_RE =
  /convert|won|booked|closed|lost|not.?interested|junk|invalid|spam|duplicate|cancel/i;

function ago(ms) {
  if (ms < HOUR) {
    return `${ Math.max(1, Math.round(ms / MIN)) } min`;
  }

  if (ms < 48 * HOUR) {
    return `${ Math.round(ms / HOUR) } h`;
  }

  return `${ Math.round(ms / DAY) } days`;
}

function localDay(t, rules) {
  return Math.floor(
    (t + rules.tzOffsetMinutes * MIN) / DAY
  );
}

function clockAt(t, now, rules) {
  const local = new Date(
    t + rules.tzOffsetMinutes * MIN
  );

  const h = local.getUTCHours();
  const m = local.getUTCMinutes();

  const time = `${ h % 12 || 12 }:${ String(m).padStart(2, '0') } ${
    h < 12 ? 'AM' : 'PM'
} `;

  const diff = localDay(t, rules) - localDay(now, rules);

  if (diff === 0) return time;
  if (diff === 1) return `tomorrow ${ time } `;

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  return `${ local.getUTCDate() } ${
    months[local.getUTCMonth()]
}, ${ time } `;
}

function daysUntil(eventDate, now, rules) {
  const value = String(eventDate || '').trim();

  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  let year, month, day;

  if (match) {
    [, year, month, day] = match;
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);

    if (!match) return undefined;

    [, day, month, year] = match;
  }

  const eventDay = Math.floor(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day)
    ) / DAY
  );

  return eventDay - localDay(now, rules);
}

function eventBadge(days) {
  if (days === 0) return 'Event today';
  if (days === 1) return 'Event tomorrow';

  return `Event in ${ days } days`;
}

function computePriority(input, now, customRules = {}) {
  const rules = {
    ...DEFAULT_PRIORITY_RULES,
    ...customRules
  };

  const calls = (input.calls || [])
    .filter(call => call.at <= now)
    .sort((a, b) => a.at - b.at);

  const outgoing = calls.filter(call => call.outgoing);
  const connected = calls.filter(call => call.connected);

  const lastAttempt = outgoing.length
    ? outgoing[outgoing.length - 1].at
    : undefined;

  const lastConnected = connected.length
    ? connected[connected.length - 1].at
    : undefined;

  const unanswered = outgoing.filter(
    call =>
      !call.connected &&
      (lastConnected === undefined || call.at > lastConnected)
  ).length;

  const today = localDay(now, rules);

  const attemptsToday = outgoing.filter(
    call => localDay(call.at, rules) === today
  ).length;

  const longestTalk = connected.reduce(
    (max, call) => Math.max(max, call.durationSeconds || 0),
    0
  );

  const days = daysUntil(input.eventDate, now, rules);

  const indiaTime = new Date(
    now + rules.tzOffsetMinutes * MIN
  );

  const indiaHour = indiaTime.getUTCHours();


  const hotNearEvent =
    days !== undefined &&
    days >= 0 &&
    days <= 2;

  const hotTimeAllowed =
    hotNearEvent ||
    (
      days !== undefined &&
      days > 2 &&
      indiaHour >= 11 &&
      indiaHour < 13
    );

  const since = timestamp =>
    timestamp === undefined ? Infinity : now - timestamp;

  const spokeAfter = timestamp =>
    timestamp !== undefined &&
    lastConnected !== undefined &&
    lastConnected > timestamp;

  const pendingCallback =
    input.callbackRequestedAt !== undefined &&
    !spokeAfter(input.callbackRequestedAt) &&
    since(input.callbackRequestedAt) < DAY;

  // Score
  let score = 0;

  score += input.orderSummaryAt !== undefined
    ? 30
    : input.eventDetailsAt !== undefined
      ? 20
      : input.eventDate
        ? 10
        : 0;

  if (days !== undefined && days >= 0) {
    score += days <= 3
      ? 30
      : days <= 7
        ? 20
        : days <= 14
          ? 10
          : days <= 30
            ? 5
            : 0;
  }

  const lastSignal = Math.max(
    input.createdAt ?? -Infinity,
    input.callbackRequestedAt ?? -Infinity,
    input.eventDateAt ?? -Infinity,
    input.eventDetailsAt ?? -Infinity
  );

  if (since(lastSignal) <= HOUR) score += 15;
  else if (since(lastSignal) <= DAY) score += 10;

  if (longestTalk >= rules.meaningfulSeconds) score += 10;

  score -= 5 * unanswered;
  score = Math.max(0, Math.min(100, score));

  // Badges
  const badges = [];

  if (days !== undefined && days >= 0 && days <= 30) {
    badges.push(eventBadge(days));
  }

  if (input.orderSummaryAt !== undefined) {
    badges.push(
      `Summary sent ${ ago(since(input.orderSummaryAt)) } ago`
    );
  } else if (input.eventDetailsAt !== undefined) {
    badges.push('Details shared');
  }

  if (pendingCallback) badges.push('Asked for call back');

  if (unanswered >= 2) {
    badges.push(`${ unanswered } unanswered`);
  }

  if (longestTalk >= rules.meaningfulSeconds) {
    badges.push(`Talked ${ Math.round(longestTalk / 60) } min`);
  }

  const result = (tag, reason, dueAt, overdue = false) => {
    const definition = TAG_BY_KEY[tag];

    return {
      tag,
      label: definition.label,
      tone: definition.tone,
      rank: definition.rank,
      actionable: definition.actionable,
      score,
      reason,
      badges: tag === 'callback'
        ? badges.filter(badge => badge !== 'Asked for call back')
        : badges,
      dueAt,
      overdue,
      daysToEvent: days
    };
  };

  const spoke = lastConnected === undefined
    ? 'never spoken'
    : `last spoke ${ ago(since(lastConnected)) } ago`;

  // 1. Closed
  if (input.status && CLOSED_RE.test(input.status)) {
    return result('closed', input.status);
  }

  if (days !== undefined && days < 0) {
    return result('closed', 'Event date has passed');
  }

  // 2. Callback requested
  if (pendingCallback) {
    const requested = input.callbackRequestedAt;
    const askedFor = input.callbackAt;

    if (
      askedFor !== undefined &&
      askedFor - now > rules.callbackLeadMinutes * MIN
    ) {
      return result(
        'scheduled',
        `Customer asked for a call at ${ clockAt(askedFor, now, rules) } `,
        askedFor - rules.callbackLeadMinutes * MIN
      );
    }

    const dueFrom = Math.max(
      requested,
      askedFor ?? requested
    );

    if (
      lastAttempt !== undefined &&
      lastAttempt > requested &&
      since(lastAttempt) < rules.callbackRetryMinutes * MIN
    ) {
      const next = lastAttempt + rules.callbackRetryMinutes * MIN;

      return result(
        'waiting',
        `Call back tried ${ ago(since(lastAttempt)) } ago, no answer.Try again at ${ clockAt(next, now, rules) } `,
        next
      );
    }

    const late = now - dueFrom;

    const reason = askedFor !== undefined
      ? `Customer asked for a call at ${ clockAt(askedFor, now, rules) } `
      : `Customer asked for a call back ${ ago(since(requested)) } ago`;

    const overdue = late > rules.callbackRetryMinutes * MIN;

    return result(
      'callback',
      overdue && askedFor !== undefined
        ? `${ reason } · overdue ${ ago(late) } `
        : reason,
      dueFrom,
      overdue
    );
  }

  // 3. Never called



  // 3. Hot: order summary sent
  if (
    input.orderSummaryAt !== undefined &&
    hotTimeAllowed
  ) {
    if (
      hotNearEvent &&
      lastAttempt !== undefined &&
      since(lastAttempt) < 30 * MIN
    ) {
      const next = lastAttempt + 30 * MIN;

      return result(
        'waiting',
        `Recently called. Hot lead will be available again at ${clockAt(next, now, rules)}`,
        next
      );
    }

    return result(
      'hot',
      `Order summary sent ${ago(since(input.orderSummaryAt))} ago`,
      input.orderSummaryAt
    );
  }

  // 4. Never called
  if (!outgoing.length) {
    const age = input.createdAt !== undefined
      ? since(input.createdAt)
      : undefined;

    const overdue =
      age !== undefined &&
      age > rules.newOverdueMinutes * MIN;

    return result(
      'new',
      age !== undefined
        ? `Arrived ${ago(age)} ago, not called yet`
        : 'Not called yet',
      input.createdAt,
      overdue
    );
  }

  // 5. Daily cap
  if (attemptsToday >= rules.maxAttemptsPerDay) {
    const next =
      (today + 1) * DAY -
      rules.tzOffsetMinutes * MIN +
      rules.dayStartHour * HOUR;

    return result(
      'waiting',
      `${attemptsToday} calls today. Try again ${clockAt(next, now, rules)}`,
      next
    );
  }

  // 6. Normal 120-minute hold
  if (since(lastAttempt) < rules.holdMinutes * MIN) {
    const next = lastAttempt + rules.holdMinutes * MIN;

    return result(
      'waiting',
      `Called ${ago(since(lastAttempt))} ago. Next try ${clockAt(next, now, rules)}`,
      next
    );
  }

  const stale = timestamp =>
    !spokeAfter(timestamp) ||
    since(lastConnected) >= rules.recontactHours * HOUR;



  // 6. Event is close
  if (
    days !== undefined &&
    days <= rules.eventSoonDays &&
    since(lastConnected) >= rules.recontactHours * HOUR
  ) {
    return result(
      'event_soon',
      `${ eventBadge(days) }, ${ spoke } `
    );
  }

  // 7. Details shared, no summary yet
  if (
    input.eventDetailsAt !== undefined &&
    input.orderSummaryAt === undefined &&
    stale(input.eventDetailsAt)
  ) {
    return result(
      'warm',
      `Shared event details ${ ago(since(input.eventDetailsAt)) } ago.Suggest a package`,
      input.eventDetailsAt
    );
  }

  // 8. Never answered
  if (!connected.length) {
    if (outgoing.length >= rules.maxBlindAttempts) {
      return result(
        'unreachable',
        `No answer after ${ outgoing.length } calls.Send a WhatsApp message first`
      );
    }

    const next = lastAttempt + rules.retryAfterHours * HOUR;

    if (now >= next) {
      return result(
        'retry',
        `No answer ${ ago(since(lastAttempt)) } ago(attempt ${ outgoing.length + 1 })`,
        next
      );
    }

    return result(
      'waiting',
      `No answer ${ ago(since(lastAttempt)) } ago.Retry at ${ clockAt(next, now, rules) } `,
      next
    );
  }

  // 9. Previously connected
  const quiet = since(lastConnected);

  if (quiet >= rules.coldDays * DAY && days === undefined) {
    return result(
      'cold',
      `No conversation for ${ ago(quiet) }`
    );
  }

  if (quiet >= rules.followUpHours * HOUR) {
    return result(
      'follow_up',
      `Last spoke ${ ago(quiet) } ago`,
      lastConnected + rules.followUpHours * HOUR
    );
  }

  const sooner =
    input.orderSummaryAt !== undefined ||
    input.eventDetailsAt !== undefined ||
    (days !== undefined && days <= rules.eventSoonDays);

  const next =
    lastConnected +
    (sooner ? rules.recontactHours : rules.followUpHours) * HOUR;

  return result(
    'waiting',
    `Spoke ${ ago(quiet) } ago.Call again ${ clockAt(next, now, rules) } `,
    next
  );
}

function comparePriority(a, b) {
  return (
    a.rank - b.rank ||
    b.score - a.score ||
    (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)
  );
}

module.exports = {
  TAGS,
  TAG_BY_KEY,
  DEFAULT_PRIORITY_RULES,
  ago,
  clockAt,
  daysUntil,
  computePriority,
  comparePriority
};
