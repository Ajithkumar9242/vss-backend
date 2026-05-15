const ALLOWED_VARIABLES = [
  'studentName',
  'parentName',
  'className',
  'schoolName',
  'amount',
  'dueDate',
];

function renderMessageTemplate(template = '', values = {}) {
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (!ALLOWED_VARIABLES.includes(key)) return '';
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

module.exports = { ALLOWED_VARIABLES, renderMessageTemplate };
