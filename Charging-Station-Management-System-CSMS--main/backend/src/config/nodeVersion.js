const MIN = { major: 22, minor: 7 };

function assertNode(version) {
  const [major, minor] = version.split('.').map(Number);
  if (major < MIN.major || (major === MIN.major && minor < MIN.minor)) {
    throw new Error(`Cần Node.js >= ${MIN.major}.${MIN.minor}, đang chạy ${version}`);
  }
}

module.exports = { assertNode };
