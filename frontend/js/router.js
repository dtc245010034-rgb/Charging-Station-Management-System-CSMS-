const HOME = {
  ADMIN: '/pages/admin.html',
  STATION_OWNER: '/pages/station-owner.html',
  OPERATOR: '/pages/operator.html',
  ACCOUNTANT: '/pages/accountant.html',
  DRIVER: '/pages/driver.html',
};

export const homePathFor = (role) => HOME[role] ?? '/index.html';

export const goHome = (user) => location.replace(homePathFor(user?.role));
