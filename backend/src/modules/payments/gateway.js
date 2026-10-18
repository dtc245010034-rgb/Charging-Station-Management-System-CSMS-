const { sandboxGateway } = require('./sandbox-sim');

function getPaymentGateway(gatewayName = 'SANDBOX') {
  const normalized = String(gatewayName || '').toUpperCase();
  if (normalized === 'SANDBOX') {
    return sandboxGateway;
  }
  throw new Error(`Cổng thanh toán "${gatewayName}" chưa được hỗ trợ`);
}

module.exports = {
  getPaymentGateway,
  sandboxGateway,
};
