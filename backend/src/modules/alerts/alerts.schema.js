const { z } = require('zod');

const alertsQuery = z.object({
  state: z.enum(['open', 'closed']).default('open'),
});

module.exports = { alertsQuery };
