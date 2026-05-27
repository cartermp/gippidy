export function formatUiButtonLabel(label: string, girlMode: boolean): string {
  return girlMode ? label : `[${label}]`;
}

export function getMessageLabel(role: string, girlMode: boolean): string {
  if (girlMode) return role === 'assistant' ? 'Gippidy' : 'You';
  return role === 'assistant' ? '[OUTPUT]' : '[INPUT]';
}
