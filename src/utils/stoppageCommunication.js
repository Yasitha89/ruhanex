export function isCommunicationAffected(row) {
  return row?.communicationAffected === true;
}

export function stoppageBarColor(row) {
  // Match the tooltip/table: a missing end timestamp means Ongoing,
  // even when an API response carries a stale isOpen: false flag.
  const ongoing = row != null && !row.stopStop_ts;
  return ongoing ? '#ff7a45' : '#ff4d4f';
}
