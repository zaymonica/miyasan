/**
 * Admin Panel - User Dropdown
 * Handles user dropdown functionality
 */

// Initialize dropdown
document.addEventListener('DOMContentLoaded', () => {
  setupUserDropdown();
});

/**
 * Setup user dropdown
 */
function setupUserDropdown() {
  const dropdownToggle = document.getElementById('userDropdownToggle');
  const dropdownMenu = document.getElementById('userDropdownMenu');

  if (!dropdownToggle || !dropdownMenu) {
    return;
  }

  // Toggle dropdown
  dropdownToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownToggle.classList.toggle('active');
    dropdownMenu.classList.toggle('active');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!dropdownToggle.contains(e.target) && !dropdownMenu.contains(e.target)) {
      dropdownToggle.classList.remove('active');
      dropdownMenu.classList.remove('active');
    }
  });

  // Close dropdown when clicking on menu items
  dropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      dropdownToggle.classList.remove('active');
      dropdownMenu.classList.remove('active');
    });
  });
}
