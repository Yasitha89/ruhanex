export function isCommunicationAffected(row) {
  return row?.communicationAffected === true;
}

export function stoppageBarColor(row) {
  return isCommunicationAffected(row) ? '#ff4d4f' : row?.isOpen ? '#ff7a45' : '#ff4d4f';
}
