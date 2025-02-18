// Global variables
let currentProblemId = null;
let currentUser = null;
let map = null;
let marker = null;
let currentCategory = 'all';
let isInitialized = false;
let isSubmitting = false; // Global flag for submission state

// Initialize the application
document.addEventListener('DOMContentLoaded', initializeApp, { once: true });

// Separate initialization function
function initializeApp() {
    if (isInitialized) return;
    isInitialized = true;

    checkAuthStatus();
    loadProblems();
    setupGeolocation();
    setupEventListeners();
    setupCategoryFilters();
    
    // Initialize camera elements
    videoElement = document.getElementById('videoElement');
    photoCanvas = document.getElementById('photoCanvas');
    capturedImage = document.getElementById('capturedImage');

    // Camera control buttons - add only once
    document.getElementById('startCamera')?.addEventListener('click', startCamera, { once: true });
    document.getElementById('capturePhoto')?.addEventListener('click', capturePhoto, { once: true });
    document.getElementById('retakePhoto')?.addEventListener('click', retakePhoto, { once: true });
}

// Remove duplicate DOMContentLoaded listeners
document.removeEventListener('DOMContentLoaded', loadProblems);
document.removeEventListener('DOMContentLoaded', checkAuthStatus);

// Add category filter setup function
function setupCategoryFilters() {
    const categoryButtons = document.querySelectorAll('#categories-filter button');
    categoryButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            categoryButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            button.classList.add('active');
            // Update current category and reload problems
            currentCategory = button.dataset.category;
            loadProblems();
        });
    });
}

// Update loadProblems function to be more robust
let isLoadingProblems = false;
async function loadProblems() {
    if (isLoadingProblems) {
        console.log('Problems are already being loaded');
        return;
    }
    
    isLoadingProblems = true;
    const problemsList = document.getElementById('problemsList');
    
    try {
        if (!problemsList) {
            throw new Error('Problems list container not found');
        }

        showLoadingSpinner();
        
        const response = await fetch('/api/problems');
        if (!response.ok) {
            throw new Error('Failed to load problems');
        }
        
        const problems = await response.json();
        
        // Create a Map with _id as key to ensure uniqueness
        const uniqueProblems = new Map();
        problems.forEach(problem => {
            uniqueProblems.set(problem._id, problem);
        });
        
        // Convert back to array and filter
        const filteredProblems = Array.from(uniqueProblems.values())
            .filter(problem => currentCategory === 'all' || 
                   problem.category.toLowerCase() === currentCategory.toLowerCase())
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Clear existing content
        problemsList.innerHTML = '';

        if (filteredProblems.length === 0) {
            problemsList.innerHTML = `
                <div class="col-12 text-center">
                    <div class="alert alert-info">
                        <i class="fas fa-info-circle me-2"></i>
                        No problems found${currentCategory !== 'all' ? ` in the "${currentCategory}" category` : ''}.
                    </div>
                </div>
            `;
            return;
        }

        // Add problems one by one
        filteredProblems.forEach(problem => {
            const problemCard = createProblemCard(problem);
            problemsList.appendChild(problemCard);
        });

    } catch (error) {
        console.error('Error loading problems:', error);
        showAlert('Failed to load problems. Please try again.', 'danger');
    } finally {
        hideLoadingSpinner();
        isLoadingProblems = false;
    }
}

// Helper function to create problem cards
function createProblemCard(problem) {
    const card = document.createElement('div');
    card.className = 'col-md-6 col-lg-4 mb-4';
    card.innerHTML = `
        <div class="card h-100 shadow-sm">
            ${problem.image ? `
                <img src="${problem.image}" class="card-img-top" alt="${escapeHtml(problem.title)}" 
                     style="height: 200px; object-fit: cover;">
            ` : `
                <div class="card-img-top bg-light d-flex align-items-center justify-content-center" 
                     style="height: 200px;">
                    <i class="fas fa-image text-muted" style="font-size: 3rem;"></i>
                </div>
            `}
        <div class="card-body">
            <h5 class="card-title">${escapeHtml(problem.title)}</h5>
                <p class="card-text text-muted">${escapeHtml(problem.description.substring(0, 100))}...</p>
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="badge bg-primary">${escapeHtml(problem.category)}</span>
                    <span class="badge bg-${getStatusColor(problem.status)}">${escapeHtml(problem.status)}</span>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                    <div class="vote-buttons">
                        <button class="btn btn-sm btn-outline-success" onclick="voteProblem('${problem._id}', 1)" title="Upvote">
                            <i class="fas fa-arrow-up"></i>
                    </button>
                        <span class="mx-2">${problem.votes || 0}</span>
                        <button class="btn btn-sm btn-outline-danger" onclick="voteProblem('${problem._id}', -1)" title="Downvote">
                            <i class="fas fa-arrow-down"></i>
                    </button>
                    </div>
                    <small class="text-muted">
                        Posted by ${escapeHtml(problem.userId?.username || 'Anonymous')}
                    </small>
                </div>
            </div>
            <div class="card-footer bg-transparent">
                <div class="d-flex justify-content-between align-items-center">
                    <small class="text-muted">ID: ${escapeHtml(problem.problemId)}</small>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline-primary" 
                                onclick="showProblemDetails('${problem._id}')">
                            View Details
                        </button>
                        ${currentUser && problem.userId && currentUser._id === problem.userId._id ? `
                            <button class="btn btn-sm btn-outline-danger" 
                                    onclick="deleteProblem('${problem.problemId}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        ` : ''}
                    </div>
                </div>
                </div>
        </div>
    `;
    return card;
}

// Helper functions
function showLoadingSpinner() {
    const spinner = document.createElement('div');
    spinner.id = 'loading-spinner';
    spinner.className = 'text-center my-3';
    spinner.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>';
    document.getElementById('problems-container').appendChild(spinner);
}

function hideLoadingSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.remove();
}

function showErrorMessage(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.getElementById('problems-container').prepend(alertDiv);
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getSeverityColor(severity) {
    const colors = {
        'HIGH': 'danger',
        'MEDIUM': 'warning',
        'LOW': 'info'
    };
    return colors[severity] || 'secondary';
}

// Function to show/hide AI suggestions
function showAISuggestions(problemId) {
    const aiSuggestionsDiv = document.getElementById(`aiSuggestions-${problemId}`);
    if (aiSuggestionsDiv) {
        const isVisible = aiSuggestionsDiv.classList.contains('show');
        if (isVisible) {
            aiSuggestionsDiv.classList.remove('show');
        } else {
            aiSuggestionsDiv.classList.add('show');
        }
    }
}

// Event Listeners Setup
function setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const problemForm = document.getElementById('problemForm');

    // Remove existing event listeners
    if (loginForm) {
        const newLoginForm = loginForm.cloneNode(true);
        loginForm.parentNode.replaceChild(newLoginForm, loginForm);
        newLoginForm.addEventListener('submit', handleLogin, { once: true });
    }

    if (registerForm) {
        const newRegisterForm = registerForm.cloneNode(true);
        registerForm.parentNode.replaceChild(newRegisterForm, registerForm);
        newRegisterForm.addEventListener('submit', handleRegister, { once: true });
    }

    if (problemForm) {
        const newProblemForm = problemForm.cloneNode(true);
        problemForm.parentNode.replaceChild(newProblemForm, problemForm);
        
        // Single event listener for problem submission
        newProblemForm.addEventListener('submit', handleProblemSubmit, { once: true });
    }
}

// Separate problem submission handler
async function handleProblemSubmit(event) {
    event.preventDefault();
    
    if (isSubmitting) {
        console.log('Submission already in progress');
        return;
    }
    
    isSubmitting = true;
    const submitButton = event.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
    if (!currentUser) {
        showAlert('Please log in to submit a problem', 'warning');
        showSection('login');
        return;
    }

        if (!event.target.checkValidity()) {
        event.stopPropagation();
            event.target.classList.add('was-validated');
        return;
    }

    const formData = new FormData();
    formData.append('title', document.getElementById('title').value.trim());
    formData.append('description', document.getElementById('description').value.trim());
    formData.append('category', document.getElementById('category').value);
    formData.append('severity', document.getElementById('severity').value);
        formData.append('latitude', document.getElementById('latitude').value);
        formData.append('longitude', document.getElementById('longitude').value);
        formData.append('address', document.getElementById('address').value);

        // Handle image upload
        const imageFile = document.getElementById('problemImage').files[0];
    if (imageFile) {
            if (imageFile.size > 5 * 1024 * 1024) {
            showAlert('Image size should not exceed 5MB', 'danger');
            return;
        }
        formData.append('image', imageFile);
    }
        // Handle captured photo
        else if (capturedImage && !capturedImage.classList.contains('d-none')) {
            const blob = await new Promise(resolve => {
                photoCanvas.toBlob(resolve, 'image/jpeg');
            });
            formData.append('image', blob, 'captured-photo.jpg');
        }

        const response = await fetch('/api/problems', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to submit problem');
        }

        const result = await response.json();
        
        // Show success message and reset form
        showAlert('Problem submitted successfully!', 'success');
        event.target.reset();
        event.target.classList.remove('was-validated');
        
        // Reset camera if it was used
        if (capturedImage && !capturedImage.classList.contains('d-none')) {
            retakePhoto();
        }

        // Switch to problems section and reload problems
        showSection('problems');
        
        // Add a delay before reloading problems
        await new Promise(resolve => setTimeout(resolve, 1000));
        await loadProblems();

    } catch (error) {
        console.error('Error:', error);
        showAlert('Error submitting problem. Please try again.', 'danger');
    } finally {
        isSubmitting = false;
        submitButton.disabled = false;
        
        // Re-attach the event listener for future submissions
        event.target.addEventListener('submit', handleProblemSubmit, { once: true });
    }
}

// Helper function to show alerts
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    // Find the container and insert the alert at the top
    const container = document.querySelector('.container');
    container.insertBefore(alertDiv, container.firstChild);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Initialize form validation on page load
document.addEventListener('DOMContentLoaded', () => {
    const forms = document.querySelectorAll('.needs-validation');
    forms.forEach(form => {
        form.addEventListener('submit', event => {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            form.classList.add('was-validated');
        }, false);
    });
});

function updateAuthUI(isLoggedIn) {
    if (isLoggedIn) {
        authNav.innerHTML = `
            <li class="nav-item">
                <span class="nav-link">Welcome, ${currentUser.username}</span>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="#" onclick="handleLogout()">Logout</a>
            </li>
        `;
        // Update greeting section for logged-in user
        const greetingTitle = document.querySelector('#greeting h1');
        const greetingText = document.querySelector('#greeting .lead');
        if (greetingTitle && greetingText) {
            greetingTitle.textContent = `Welcome back, ${currentUser.username}!`;
            greetingText.textContent = `Thank you for being an active member of our community. Your contributions help make our neighborhood better.`;
        }
    } else {
        authNav.innerHTML = `
            <li class="nav-item">
                <a class="nav-link" href="#" onclick="showSection('login')">Login</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="#" onclick="showSection('register')">Register</a>
            </li>
        `;
        // Reset greeting section for logged-out users
        const greetingTitle = document.querySelector('#greeting h1');
        const greetingText = document.querySelector('#greeting .lead');
        if (greetingTitle && greetingText) {
            greetingTitle.textContent = 'Welcome to Community Problem Solver';
            greetingText.textContent = 'Together, we can make our community better. Report issues, suggest solutions, and track progress on local problems.';
        }
    }
}

// Add showGreeting function
function showGreeting(username) {
    const time = new Date().getHours();
    let greeting;
    let emoji;
    
    // Determine greeting and emoji based on time of day
    if (time < 12) {
        greeting = "Good morning";
        emoji = "🌅";
    } else if (time < 17) {
        greeting = "Good afternoon";
        emoji = "☀️";
    } else if (time < 22) {
        greeting = "Good evening";
        emoji = "🌆";
    } else {
        greeting = "Good night";
        emoji = "🌙";
    }

    // Get random motivational message
    const motivationalMessages = [
        "Let's make our community better together! 🌟",
        "Your voice matters in shaping our future! 🎯",
        "Together we can solve anything! 💪",
        "Thank you for being an amazing community member! 🙏",
        "Ready to create positive change? 🌈",
        "Your insights make our community stronger! 💡",
        "Every contribution creates a better tomorrow! ✨",
        "You're making our neighborhood better! 🏡",
        "Together we build a stronger community! 🤝",
        "Your participation makes a difference! 🌱"
    ];
    const randomMessage = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];

    // Get the toast element
    const toastEl = document.getElementById('greetingToast');
    const greetingMessage = document.getElementById('greeting-message');

    // Set personalized message
    greetingMessage.innerHTML = `${greeting}, ${username}! ${emoji}`;

    // Initialize and show the toast with longer duration
    try {
        const toast = new bootstrap.Toast(toastEl, {
            animation: true,
            autohide: true,
            delay: 6000 // Show for 6 seconds
        });
        toast.show();

        // Update main greeting section with animation
        const greetingTitle = document.querySelector('#greeting h1');
        const greetingText = document.querySelector('#greeting .lead');
        if (greetingTitle && greetingText) {
            greetingTitle.style.opacity = '0';
            greetingText.style.opacity = '0';
            
            setTimeout(() => {
                greetingTitle.textContent = `${greeting}, ${username}! ${emoji}`;
                greetingText.textContent = randomMessage;
                
                greetingTitle.style.transition = 'opacity 0.5s ease-in';
                greetingText.style.transition = 'opacity 0.5s ease-in';
                greetingTitle.style.opacity = '1';
                greetingText.style.opacity = '1';
            }, 100);
        }
    } catch (error) {
        console.error('Error showing toast:', error);
        // Fallback to alert if toast fails
        showAlert(`${greeting}, ${username}! ${randomMessage}`, 'info');
    }
}

// Update handleLogin function
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const userData = await response.json();
            currentUser = userData;
            
            // Show greeting toast first
            showGreeting(currentUser.username);
            
            // Then update the UI
            await checkAuthStatus();
            showSection('problems');
            
            // Update greeting section with personalized message
            const greetingTitle = document.querySelector('#greeting h1');
            const greetingText = document.querySelector('#greeting .lead');
            if (greetingTitle && greetingText) {
                greetingTitle.textContent = `Welcome back, ${currentUser.username}!`;
                greetingText.textContent = `Thank you for being an active member of our community. Your contributions help make our neighborhood better.`;
            }
        } else {
            const data = await response.json();
            showAlert(data.error || 'Login failed', 'danger');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAlert('Error logging in', 'danger');
    }
}

// Update handleLogout function
async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        currentUser = null;
        updateAuthUI(false);
        showSection('problems');
        showAlert('You have been successfully logged out. See you soon!', 'info');
    } catch (error) {
        console.error('Logout error:', error);
        showAlert('Error logging out', 'danger');
    }
}

// Add showProblemDetails function
async function showProblemDetails(problemId) {
    try {
        const response = await fetch(`/api/problems/${problemId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch problem details');
        }
        const problem = await response.json();

        // Update modal content
        const modalBody = document.querySelector('#problemModal .modal-body');
        modalBody.innerHTML = `
            <div class="problem-details">
                <h4>${escapeHtml(problem.title)}</h4>
                <div class="mb-3">
                    <span class="badge bg-primary">${escapeHtml(problem.category)}</span>
                    <span class="badge bg-${getStatusColor(problem.status)}">${escapeHtml(problem.status)}</span>
                </div>
                <p class="description">${escapeHtml(problem.description)}</p>
                ${problem.image ? `
                    <div class="image-container mb-3">
                        <img src="${problem.image}" class="img-fluid rounded" alt="Problem image">
                    </div>
                ` : ''}
                <div class="meta-info">
                    <p class="text-muted">
                        <small>Posted by: ${escapeHtml(problem.userId?.username || 'Anonymous')}</small><br>
                        <small>Location: ${escapeHtml(problem.location?.address || 'Location not specified')}</small><br>
                        <small>Problem ID: ${escapeHtml(problem.problemId)}</small>
                    </p>
                </div>
                <div class="actions mt-3">
                    <div class="vote-buttons mb-3">
                        <button class="btn btn-outline-success" onclick="voteProblem('${problem._id}', 1)">
                            <i class="fas fa-arrow-up"></i> Upvote (${problem.votes || 0})
                        </button>
                        <button class="btn btn-outline-danger ms-2" onclick="voteProblem('${problem._id}', -1)">
                            <i class="fas fa-arrow-down"></i> Downvote
                        </button>
                    </div>
                    ${currentUser && problem.userId && currentUser._id === problem.userId._id ? `
                        <div class="owner-actions">
                            <button class="btn btn-primary" onclick="editProblem('${problem._id}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn btn-danger ms-2" onclick="deleteProblem('${problem.problemId}')">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    ` : ''}
                </div>
                <div class="comments-section mt-4">
                    <h5>Comments</h5>
                    <div id="commentsList" class="mb-3">
                        ${problem.comments?.length ? problem.comments.map(comment => `
                            <div class="comment border-bottom py-2">
                                <p class="mb-1">${escapeHtml(comment.text)}</p>
                                <small class="text-muted">
                                    By ${escapeHtml(comment.userId?.username || 'Anonymous')} - 
                                    ${new Date(comment.createdAt).toLocaleString()}
                                </small>
                            </div>
                        `).join('') : '<p class="text-muted">No comments yet</p>'}
                    </div>
                    ${currentUser ? `
                        <div class="add-comment">
                            <textarea id="newComment" class="form-control mb-2" rows="2" 
                                    placeholder="Add your comment..."></textarea>
                            <button class="btn btn-primary" onclick="addComment('${problem._id}')">
                                Post Comment
                            </button>
                        </div>
                    ` : '<p class="text-muted">Please login to comment</p>'}
                </div>
            </div>
        `;

        // Show the modal
        const problemModal = new bootstrap.Modal(document.getElementById('problemModal'));
        problemModal.show();
    } catch (error) {
        console.error('Error showing problem details:', error);
        showAlert('Error loading problem details. Please try again.', 'danger');
    }
}

// Add comment function
async function addComment(problemId) {
    if (!currentUser) {
        showAlert('Please login to add a comment', 'warning');
        return;
    }

    const commentText = document.getElementById('newComment').value.trim();
    if (!commentText) {
        showAlert('Please enter a comment', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/problems/${problemId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: commentText })
        });

        if (!response.ok) {
            throw new Error('Failed to add comment');
        }

        // Refresh the problem details to show the new comment
        await showProblemDetails(problemId);
        showAlert('Comment added successfully', 'success');
    } catch (error) {
        console.error('Error adding comment:', error);
        showAlert('Error adding comment. Please try again.', 'danger');
    }
}