export function isCommunicationAffected(row) {
  return row?.communicationAffected === true;
}

export function stoppageBarColor(row) {
  return isCommunicationAffected(row) ? '#8b5cf6' : row?.isOpen ? '#ff7a45' : '#ff4d4f';
}
