/**
 * Uninstall hook - runs when the addon is deleted
 */
module.exports = async function uninstall() {
  console.log('Example Add-on uninstalled!');
  // Add your cleanup logic here
  // e.g., drop database tables, remove files, etc.
};
