const ROLES = {
  ADMINISTRATOR: 'Administrator',
  MANAGER: 'Manager',
  DATA_ENTRY: 'Data Entry',
  CONSULTANT: 'Consultant',
};

const ALL_ROLES = Object.values(ROLES);

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
  HTTP_STATUS,
};
