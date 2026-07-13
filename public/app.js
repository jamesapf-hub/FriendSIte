// Co-Cal Frontend Application Logic - Full Year Coordination

document.addEventListener('DOMContentLoaded', () => {
  // Determine if we are on the landing page or the board page
  const isLandingPage = !!document.getElementById('create-board-form');
  const isBoardPage = !!document.getElementById('input-calendar-grid');

  if (isLandingPage) {
    initLandingPage();
  } else if (isBoardPage) {
    initBoardPage();
  }
});

// ==========================================
// LANDING PAGE LOGIC
// ==========================================
function initLandingPage() {
  const form = document.getElementById('create-board-form');
  const createCard = document.getElementById('create-card');
  const successCard = document.getElementById('success-card');
  
  const boardPassword = document.getElementById('board-password');
  const togglePasswordBtn = document.getElementById('toggle-password-btn');
  
  const shareUrlInput = document.getElementById('share-url');
  const copyBtn = document.getElementById('copy-btn');
  const copyBtnText = document.getElementById('copy-btn-text');
  const viewBoardBtn = document.getElementById('view-board-btn');
  const createAnotherBtn = document.getElementById('create-another-btn');

  // Toggle Password Visibility
  togglePasswordBtn.addEventListener('click', () => {
    if (boardPassword.type === 'password') {
      boardPassword.type = 'text';
      togglePasswordBtn.textContent = '🙈';
    } else {
      boardPassword.type = 'password';
      togglePasswordBtn.textContent = '👁️';
    }
  });

  // Form Submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');
    
    // Show spinner
    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');
    submitBtn.disabled = true;
    
    const payload = {
      name: document.getElementById('board-name').value,
      password: boardPassword.value || null
    };

    try {
      const response = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to create board');
      }

      const data = await response.json();
      
      // Cache password in sessionStorage for seamless redirect transition
      if (payload.password) {
        sessionStorage.setItem(`co_cal_pwd_${data.id}`, payload.password);
      }
      
      // Update Success UI
      const shareUrl = `${window.location.origin}/board/${data.id}`;
      shareUrlInput.value = shareUrl;
      viewBoardBtn.href = `/board/${data.id}`;
      
      createCard.classList.add('hidden');
      successCard.classList.remove('hidden');
    } catch (err) {
      alert('Error creating board. Please try again.');
      console.error(err);
    } finally {
      // Hide spinner
      btnText.classList.remove('hidden');
      spinner.classList.add('hidden');
      submitBtn.disabled = false;
    }
  });

  // Copy Link
  copyBtn.addEventListener('click', () => {
    shareUrlInput.select();
    shareUrlInput.setSelectionRange(0, 99999); // For mobile devices
    navigator.clipboard.writeText(shareUrlInput.value).then(() => {
      copyBtnText.textContent = 'Copied!';
      copyBtn.classList.add('btn-success');
      
      setTimeout(() => {
        copyBtnText.textContent = 'Copy Link';
        copyBtn.classList.remove('btn-success');
      }, 2000);
    });
  });

  // Create Another
  createAnotherBtn.addEventListener('click', () => {
    form.reset();
    successCard.classList.add('hidden');
    createCard.classList.remove('hidden');
  });
}

// ==========================================
// BOARD VIEW PAGE LOGIC
// ==========================================
function initBoardPage() {
  // Extract board ID from URL path (e.g. /board/uuid)
  const pathParts = window.location.pathname.split('/');
  const boardId = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
  
  let boardData = null;
  let selectedAvailability = {}; // { "YYYY-MM-DD": { morning: bool, night: bool } }
  let editingFriendName = null;
  let boardPassword = sessionStorage.getItem(`co_cal_pwd_${boardId}`) || '';

  // Month navigation state
  const todayDate = new Date();
  let currentYear = todayDate.getFullYear();
  let currentMonth = todayDate.getMonth(); // 0-indexed (0 = Jan, 11 = Dec)

  // DOM Elements
  const passwordOverlay = document.getElementById('password-overlay');
  const passwordForm = document.getElementById('password-form');
  const boardAuthPassword = document.getElementById('board-auth-password');
  const toggleAuthPasswordBtn = document.getElementById('toggle-auth-password-btn');
  const passwordError = document.getElementById('password-error');
  
  const deleteOverlay = document.getElementById('delete-overlay');
  const deleteWarningText = document.getElementById('delete-warning-text');
  const deletePasswordContainer = document.getElementById('delete-password-container');
  const deleteAuthPassword = document.getElementById('delete-auth-password');
  const deleteError = document.getElementById('delete-error');
  const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
  const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
  let nameToDelete = null;

  const boardTitle = document.getElementById('board-title');
  const currentMonthYearLabel = document.getElementById('current-month-year');
  const prevMonthBtn = document.getElementById('prev-month-btn');
  const nextMonthBtn = document.getElementById('next-month-btn');
  const lockIcon = document.getElementById('lock-icon');
  const copyShareBtn = document.getElementById('copy-share-btn');
  
  const editorTitle = document.getElementById('editor-title');
  const editingBanner = document.getElementById('editing-banner');
  const editingNameHighlight = document.getElementById('editing-name-highlight');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  
  const availabilityForm = document.getElementById('availability-form');
  const friendNameInput = document.getElementById('friend-name');
  const inputCalendarGrid = document.getElementById('input-calendar-grid');
  const clearSelectionsBtn = document.getElementById('clear-selections-btn');
  const saveAvailabilityBtn = document.getElementById('save-availability-btn');
  
  const heatmapCalendarGrid = document.getElementById('heatmap-calendar-grid');
  const respondentsCount = document.getElementById('respondents-count');
  const respondentsList = document.getElementById('respondents-list');

  // Pre-fill local storage username if it exists
  const savedUserName = localStorage.getItem('co_cal_username');
  if (savedUserName) {
    friendNameInput.value = savedUserName;
  }

  // Load Board Data
  fetchBoardDetails();

  // Password Reveal Toggle
  toggleAuthPasswordBtn.addEventListener('click', () => {
    if (boardAuthPassword.type === 'password') {
      boardAuthPassword.type = 'text';
      toggleAuthPasswordBtn.textContent = '🙈';
    } else {
      boardAuthPassword.type = 'password';
      toggleAuthPasswordBtn.textContent = '👁️';
    }
  });

  // Password Unlock Submit
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = boardAuthPassword.value;
    
    try {
      const response = await fetch(`/api/boards/${boardId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      
      if (response.ok) {
        boardPassword = pwd;
        sessionStorage.setItem(`co_cal_pwd_${boardId}`, pwd);
        passwordOverlay.classList.add('hidden');
        passwordError.classList.add('hidden');
        fetchBoardDetails();
      } else {
        passwordError.classList.remove('hidden');
      }
    } catch (err) {
      console.error(err);
      passwordError.textContent = 'Connection error. Please try again.';
      passwordError.classList.remove('hidden');
    }
  });

  // Month Switchers
  prevMonthBtn.addEventListener('click', () => {
    if (currentMonth === 0) {
      currentMonth = 11;
      currentYear--;
    } else {
      currentMonth--;
    }
    updateMonthDisplay();
  });

  nextMonthBtn.addEventListener('click', () => {
    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear++;
    } else {
      currentMonth++;
    }
    updateMonthDisplay();
  });

  // Copy share link button
  copyShareBtn.addEventListener('click', () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      const originalText = copyShareBtn.innerHTML;
      copyShareBtn.innerHTML = '<span>✓ Copied Link!</span>';
      copyShareBtn.classList.add('btn-success');
      
      setTimeout(() => {
        copyShareBtn.innerHTML = originalText;
        copyShareBtn.classList.remove('btn-success');
      }, 2000);
    });
  });

  // Clear Editor Grid Selections (only for the active month)
  clearSelectionsBtn.addEventListener('click', () => {
    clearCurrentMonthSelections();
    renderInputCalendar();
  });

  // Cancel Editing Active respondent
  cancelEditBtn.addEventListener('click', () => {
    exitEditMode();
  });

  // Save Availability Form Submit
  availabilityForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = friendNameInput.value.trim();
    if (!name) return;
    
    // Save username in localStorage for convenience
    localStorage.setItem('co_cal_username', name);
    
    saveAvailabilityBtn.disabled = true;
    
    const payload = {
      friendName: name,
      availability: selectedAvailability,
      password: boardPassword
    };

    try {
      const response = await fetch(`/api/boards/${boardId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save response');
      }
      
      // Success: refresh board details
      await fetchBoardDetails();
      
      // If we were editing, exit edit mode
      if (editingFriendName) {
        exitEditMode();
      } else {
        // Clear all session selections
        selectedAvailability = {};
        renderInputCalendar();
        friendNameInput.value = '';
      }
      
      // Visual feedback
      alert('Availability saved successfully!');
    } catch (err) {
      alert(`Error saving: ${err.message}`);
      console.error(err);
    } finally {
      saveAvailabilityBtn.disabled = false;
    }
  });

  // Cancel deletion
  cancelDeleteBtn.addEventListener('click', () => {
    deleteOverlay.classList.add('hidden');
    nameToDelete = null;
  });

  // Confirm delete response
  confirmDeleteBtn.addEventListener('click', async () => {
    if (!nameToDelete) return;
    
    const pwd = boardPassword || deleteAuthPassword.value;
    
    try {
      const response = await fetch(`/api/boards/${boardId}/respond`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendName: nameToDelete, password: pwd })
      });
      
      if (response.ok) {
        deleteOverlay.classList.add('hidden');
        nameToDelete = null;
        deleteAuthPassword.value = '';
        deleteError.classList.add('hidden');
        await fetchBoardDetails();
      } else {
        deleteError.classList.remove('hidden');
      }
    } catch (err) {
      console.error(err);
      deleteError.textContent = 'Failed to delete response. Network error.';
      deleteError.classList.remove('hidden');
    }
  });

  // Fetch Board Details and handle authentication response
  async function fetchBoardDetails() {
    try {
      const headers = {};
      if (boardPassword) {
        headers['x-board-password'] = boardPassword;
      }
      
      const response = await fetch(`/api/boards/${boardId}`, { headers });
      
      if (response.status === 401) {
        const data = await response.json();
        if (data.passwordRequired) {
          passwordOverlay.classList.remove('hidden');
          return;
        }
      }
      
      if (!response.ok) {
        throw new Error('Board not found or server error');
      }
      
      boardData = await response.json();
      
      // Update UI Header details
      boardTitle.textContent = boardData.name;
      document.title = `${boardData.name} | Co-Cal`;
      
      if (boardData.passwordRequired) {
        lockIcon.classList.remove('hidden');
      } else {
        lockIcon.classList.add('hidden');
      }
      
      // Redraw everything
      updateMonthDisplay();
      renderRespondentsList();
    } catch (err) {
      boardTitle.textContent = 'Board Not Found';
      currentMonthYearLabel.textContent = 'Error';
      console.error(err);
    }
  }

  // Update calendar displays when switching months
  function updateMonthDisplay() {
    if (!boardData) return;
    
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    currentMonthYearLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    
    renderInputCalendar();
    renderHeatmapCalendar();
  }

  // Clear selections just for dates belonging to the current month
  function clearCurrentMonthSelections() {
    generateMonthlyCalendarDays(currentYear, currentMonth, (date, isMonthDay, dateStr) => {
      if (isMonthDay && selectedAvailability[dateStr]) {
        selectedAvailability[dateStr] = { morning: false, night: false };
      }
    });
  }

  // Render the calendar that takes input toggles for active month
  function renderInputCalendar() {
    inputCalendarGrid.innerHTML = '';
    if (!boardData) return;
    
    generateMonthlyCalendarDays(currentYear, currentMonth, (date, isMonthDay, dateStr) => {
      const cell = document.createElement('div');
      
      if (!isMonthDay) {
        cell.className = 'calendar-cell empty';
        inputCalendarGrid.appendChild(cell);
        return;
      }
      
      cell.className = 'calendar-cell';
      const isToday = formatDateISO(new Date()) === dateStr;
      if (isToday) cell.classList.add('today');
      
      // Add day number
      const numLabel = document.createElement('span');
      numLabel.className = 'calendar-cell-num';
      numLabel.textContent = date.getDate();
      cell.appendChild(numLabel);
      
      // Add morning/night slots container
      const slotsContainer = document.createElement('div');
      slotsContainer.className = 'calendar-slots';
      
      // Ensure local state exists for this date
      if (!selectedAvailability[dateStr]) {
        selectedAvailability[dateStr] = { morning: false, night: false };
      }
      
      // Morning Slot Button
      const amBtn = document.createElement('button');
      amBtn.type = 'button';
      amBtn.className = 'slot-toggle';
      amBtn.textContent = 'AM (Morning)';
      if (selectedAvailability[dateStr].morning) {
        amBtn.classList.add('active');
      }
      amBtn.addEventListener('click', () => {
        selectedAvailability[dateStr].morning = !selectedAvailability[dateStr].morning;
        amBtn.classList.toggle('active');
      });
      
      // Night Slot Button
      const pmBtn = document.createElement('button');
      pmBtn.type = 'button';
      pmBtn.className = 'slot-toggle';
      pmBtn.textContent = 'PM (Night)';
      if (selectedAvailability[dateStr].night) {
        pmBtn.classList.add('active');
      }
      pmBtn.addEventListener('click', () => {
        selectedAvailability[dateStr].night = !selectedAvailability[dateStr].night;
        pmBtn.classList.toggle('active');
      });
      
      slotsContainer.appendChild(amBtn);
      slotsContainer.appendChild(pmBtn);
      cell.appendChild(slotsContainer);
      inputCalendarGrid.appendChild(cell);
    });
  }

  // Render the heatmap calendar summarizing group availability
  function renderHeatmapCalendar() {
    heatmapCalendarGrid.innerHTML = '';
    if (!boardData) return;
    
    const responses = boardData.responses || {};
    const respondents = Object.keys(responses);
    const totalRespondents = respondents.length;
    
    generateMonthlyCalendarDays(currentYear, currentMonth, (date, isMonthDay, dateStr) => {
      const cell = document.createElement('div');
      
      if (!isMonthDay) {
        cell.className = 'calendar-cell empty';
        heatmapCalendarGrid.appendChild(cell);
        return;
      }
      
      cell.className = 'calendar-cell';
      const isToday = formatDateISO(new Date()) === dateStr;
      if (isToday) cell.classList.add('today');
      
      // Add day number
      const numLabel = document.createElement('span');
      numLabel.className = 'calendar-cell-num';
      numLabel.textContent = date.getDate();
      cell.appendChild(numLabel);
      
      // Heatmap slots container
      const slotsContainer = document.createElement('div');
      slotsContainer.className = 'heatmap-slots';
      
      // Calculate Morning Availability list
      const morningAvailable = [];
      // Calculate Night Availability list
      const nightAvailable = [];
      
      respondents.forEach(name => {
        const friendAvail = responses[name] || {};
        if (friendAvail[dateStr]) {
          if (friendAvail[dateStr].morning) morningAvailable.push(name);
          if (friendAvail[dateStr].night) nightAvailable.push(name);
        }
      });
      
      // Morning Slot heatmap
      const amHeat = document.createElement('div');
      amHeat.className = 'heatmap-slot';
      amHeat.textContent = 'AM';
      if (morningAvailable.length > 0) {
        amHeat.classList.add('active');
        const ratio = totalRespondents > 0 ? morningAvailable.length / totalRespondents : 0;
        amHeat.style.backgroundColor = `rgba(16, 185, 129, ${0.15 + ratio * 0.85})`;
      }
      // Tooltip child
      const amTooltip = document.createElement('span');
      amTooltip.className = 'tooltip-data';
      amTooltip.innerHTML = `<strong>Morning (AM):</strong><br>${morningAvailable.length > 0 ? morningAvailable.join(', ') : 'No one'} (${morningAvailable.length}/${totalRespondents})`;
      amHeat.appendChild(amTooltip);
      
      // Night Slot heatmap
      const pmHeat = document.createElement('div');
      pmHeat.className = 'heatmap-slot';
      pmHeat.textContent = 'PM';
      if (nightAvailable.length > 0) {
        pmHeat.classList.add('active');
        const ratio = totalRespondents > 0 ? nightAvailable.length / totalRespondents : 0;
        pmHeat.style.backgroundColor = `rgba(16, 185, 129, ${0.15 + ratio * 0.85})`;
      }
      // Tooltip child
      const pmTooltip = document.createElement('span');
      pmTooltip.className = 'tooltip-data';
      pmTooltip.innerHTML = `<strong>Night (PM):</strong><br>${nightAvailable.length > 0 ? nightAvailable.join(', ') : 'No one'} (${nightAvailable.length}/${totalRespondents})`;
      pmHeat.appendChild(pmTooltip);
      
      slotsContainer.appendChild(amHeat);
      slotsContainer.appendChild(pmHeat);
      cell.appendChild(slotsContainer);
      heatmapCalendarGrid.appendChild(cell);
    });
  }

  // Render the respondents list sidebar
  function renderRespondentsList() {
    respondentsList.innerHTML = '';
    const responses = boardData.responses || {};
    const names = Object.keys(responses);
    
    respondentsCount.textContent = `${names.length} friend${names.length === 1 ? '' : 's'} responded`;
    
    if (names.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No responses yet. Be the first!';
      respondentsList.appendChild(empty);
      return;
    }
    
    names.sort().forEach(name => {
      const item = document.createElement('div');
      item.className = 'respondent-item';
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'respondent-name';
      nameSpan.textContent = name;
      item.appendChild(nameSpan);
      
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'respondent-actions';
      
      // Edit button
      const editBtn = document.createElement('button');
      editBtn.className = 'respondent-action-btn edit';
      editBtn.title = 'Edit Response';
      editBtn.innerHTML = '✏️';
      editBtn.addEventListener('click', () => {
        enterEditMode(name);
      });
      
      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'respondent-action-btn delete';
      deleteBtn.title = 'Delete Response';
      deleteBtn.innerHTML = '🗑️';
      deleteBtn.addEventListener('click', () => {
        promptDeleteResponse(name);
      });
      
      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(deleteBtn);
      item.appendChild(actionsDiv);
      respondentsList.appendChild(item);
    });
  }

  // Enter editing mode for a respondent
  function enterEditMode(name) {
    editingFriendName = name;
    editingNameHighlight.textContent = name;
    
    // Fill text field and lock it so name cannot be changed while editing
    friendNameInput.value = name;
    friendNameInput.disabled = true;
    
    editorTitle.textContent = '✏️ Edit Your Availability';
    editingBanner.classList.remove('hidden');
    
    // Copy entire response availability object
    const original = boardData.responses[name] || {};
    selectedAvailability = JSON.parse(JSON.stringify(original));
    
    renderInputCalendar();
    
    // Scroll to form input
    document.getElementById('editor-section').scrollIntoView({ behavior: 'smooth' });
  }

  // Cancel edit mode
  function exitEditMode() {
    editingFriendName = null;
    friendNameInput.value = localStorage.getItem('co_cal_username') || '';
    friendNameInput.disabled = false;
    
    editorTitle.textContent = '✍️ Mark Your Availability';
    editingBanner.classList.add('hidden');
    
    selectedAvailability = {};
    renderInputCalendar();
  }

  // Trigger deletion prompt
  function promptDeleteResponse(name) {
    nameToDelete = name;
    deleteWarningText.textContent = `Are you sure you want to delete ${name}'s availability response?`;
    
    // If the board doesn't require a password OR we already have the authenticated password cached,
    // we don't need to ask for a password in the deletion modal.
    if (!boardData.passwordRequired || boardPassword) {
      deletePasswordContainer.classList.add('hidden');
    } else {
      deletePasswordContainer.classList.remove('hidden');
      deleteAuthPassword.value = '';
      deleteAuthPassword.required = true;
    }
    
    deleteError.classList.add('hidden');
    deleteOverlay.classList.remove('hidden');
  }

  // Core Calendar Generator for Month-by-Month alignment
  // Calls a callback with (dateObject, isWithinMonthRange, dateStringISO) for each cell
  function generateMonthlyCalendarDays(year, month, callback) {
    // Determine total days in month
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    // Determine starting day index of first date (0 = Sunday, 6 = Saturday)
    const firstDayIndex = new Date(year, month, 1).getDay();
    
    // Render preceding week padding
    for (let i = 0; i < firstDayIndex; i++) {
      callback(null, false, null);
    }
    
    // Render month active days
    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, month, day);
      const dateStr = formatDateISO(date);
      callback(date, true, dateStr);
    }
    
    // Render trailing week padding
    const totalGridCells = firstDayIndex + totalDays;
    const remainder = totalGridCells % 7;
    if (remainder !== 0) {
      const trailingPaddingCount = 7 - remainder;
      for (let i = 0; i < trailingPaddingCount; i++) {
        callback(null, false, null);
      }
    }
  }
}

// ==========================================
// UTILITY HELPERS
// ==========================================

// Format date to YYYY-MM-DD
function formatDateISO(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
