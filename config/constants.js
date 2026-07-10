const ROLES = {
  ADMINISTRATOR: 'Administrator',
  MANAGER: 'Manager',
  DATA_ENTRY: 'Data Entry',
  CONSULTANT: 'Consultant',
};

const ALL_ROLES = Object.values(ROLES);

const HARDWARE_WRITE_ROLES = [
  ROLES.ADMINISTRATOR,
  ROLES.MANAGER,
  ROLES.DATA_ENTRY,
];

const PRICING_BASIS = {
  AGREED: 'Agreed',
  RETAIL: 'Retail',
};

const ALL_PRICING_BASIS = Object.values(PRICING_BASIS);

const HARDWARE_SORT_FIELDS = [
  'stockCode',
  'groupCode',
  'description',
  'createdAt',
  'updatedAt',
];

const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
};

module.exports = {
  ROLES,
  ALL_ROLES,
  HARDWARE_WRITE_ROLES,
  PRICING_BASIS,
  ALL_PRICING_BASIS,
  HARDWARE_SORT_FIELDS,
  PAGINATION,
  HTTP_STATUS,
};
