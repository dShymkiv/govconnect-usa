'use strict';

/** Fields treated as PII — encrypted at rest in dump files. */
const USER_PII_FIELDS = ['ssnLast4', 'phone', 'dateOfBirth', 'streetAddress'];
const DOCUMENT_PII_FIELDS = [
  'documentNumber',
  'fullName',
  'dateOfBirth',
  'address',
  'licenseClass',
  'vin',
  'plateNumber',
  'spouseName',
  'institution',
];

module.exports = { USER_PII_FIELDS, DOCUMENT_PII_FIELDS };
