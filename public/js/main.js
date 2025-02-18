// Global variables
let currentProblemId = null;
let currentUser = null;
let map = null;
let marker = null;

// Add camera handling variables
let stream = null;
let videoElement = null;
let photoCanvas = null;
let capturedImage = null;
let imageCapture = null;

// Add these variables at the top with other global variables
let currentCategory = 'all';
let allProblems = [];
let isInitialized = false;
let isSubmitting = false;

// DOM Elements
const problemsList = document.getElementById('problemsList');
const problemForm = document.getElementById('problemForm');
const solutionForm = document.getElementById('solutionForm');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authNav = document.getElementById('authNav');
const problemModal = new bootstrap.Modal(document.getElementById('problemModal'));

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
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
});

// Event Listeners Setup
function setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const problemForm = document.getElementById('problemForm');

    // Remove existing event listeners by cloning
    if (loginForm) {
        const newLoginForm = loginForm.cloneNode(true);
        loginForm.parentNode.replaceChild(newLoginForm, loginForm);
        newLoginForm.addEventListener('submit', handleLogin);
    }

    if (registerForm) {
        const newRegisterForm = registerForm.cloneNode(true);
        registerForm.parentNode.replaceChild(newRegisterForm, registerForm);
        newRegisterForm.addEventListener('submit', handleRegister);
    }

    if (problemForm) {
        const newProblemForm = problemForm.cloneNode(true);
        problemForm.parentNode.replaceChild(newProblemForm, problemForm);
        
        // Add form validation listeners
        newProblemForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            
            if (isSubmitting) {
                console.log('Submission already in progress');
                return;
            }

            if (!newProblemForm.checkValidity()) {
                event.stopPropagation();
                newProblemForm.classList.add('was-validated');
                return;
            }

            const submitButton = newProblemForm.querySelector('button[type="submit"]');
            submitButton.disabled = true;
            isSubmitting = true;

            try {
                await handleProblemSubmit(event);
            } finally {
                isSubmitting = false;
                submitButton.disabled = false;
            }
        });
    }
}

// Authentication Functions
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/user');
        if (response.ok) {
            currentUser = await response.json();
            updateAuthUI(true);
        } else {
            updateAuthUI(false);
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        updateAuthUI(false);
    }
}

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
    } else {
        authNav.innerHTML = `
            <li class="nav-item">
                <a class="nav-link" href="#" data-bs-toggle="modal" data-bs-target="#loginModal">Login</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" href="#" data-bs-toggle="modal" data-bs-target="#registerModal">Register</a>
            </li>
        `;
    }
}

async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        currentUser = null;
        updateAuthUI(false);
        
        // Reset greeting section to default
        const greetingTitle = document.querySelector('#greeting h1');
        const greetingText = document.querySelector('#greeting .lead');
        if (greetingTitle && greetingText) {
            greetingTitle.style.opacity = '0';
            greetingText.style.opacity = '0';
            
            setTimeout(() => {
                greetingTitle.textContent = 'Welcome to BuddyFix';
                greetingText.textContent = 'Together, we can make our community better. Report issues, suggest solutions, and track progress on local problems.';
                
                greetingTitle.style.transition = 'opacity 0.5s ease-in';
                greetingText.style.transition = 'opacity 0.5s ease-in';
                greetingTitle.style.opacity = '1';
                greetingText.style.opacity = '1';
            }, 100);
        }

        // Show the home section (greeting section)
        document.querySelectorAll('.section').forEach(section => {
            section.classList.add('d-none');
        });
        document.getElementById('greeting').classList.remove('d-none');
        
        showAlert('Logged out successfully', 'success');
    } catch (error) {
        console.error('Logout error:', error);
        showAlert('Error logging out', 'danger');
    }
}

// Navigation Functions
function showSection(sectionId) {
    // Close any open modals
    const modals = ['loginModal', 'registerModal'];
    modals.forEach(modalId => {
        const modal = bootstrap.Modal.getInstance(document.getElementById(modalId));
        if (modal) modal.hide();
    });

    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('d-none');
    });
    document.getElementById(sectionId).classList.remove('d-none');
}

// Geolocation Setup
function setupGeolocation() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(position => {
            const { latitude, longitude } = position.coords;
            document.getElementById('latitude').value = latitude;
            document.getElementById('longitude').value = longitude;
            updateLocationDisplay(latitude, longitude);
        }, error => {
            console.error('Error getting location:', error);
        });
    }
}

// Update Location Display
function updateLocationDisplay(latitude, longitude) {
    // Use reverse geocoding to get address
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('address').value = data.display_name;
        })
        .catch(error => console.error('Error getting address:', error));
}

// Load Problems
async function loadProblems() {
    try {
        showLoadingSpinner();
        const response = await fetch('/api/problems');
        if (!response.ok) {
            throw new Error('Failed to load problems');
        }
        allProblems = await response.json(); // Store all problems
        filterAndDisplayProblems(currentCategory); // Display filtered problems
    } catch (error) {
        console.error('Error loading problems:', error);
        showError('Failed to load problems');
    } finally {
        hideLoadingSpinner();
    }
}

// Display Problems
function displayProblems(problems) {
    problemsList.innerHTML = problems.map(problem => `
        <div class="col-md-6 col-lg-4 mb-4">
            <div class="card h-100 shadow-sm">
                ${problem.image ? `
                    <img src="${problem.image}" class="card-img-top" alt="${problem.title}" 
                         style="height: 200px; object-fit: cover;">
                ` : `
                    <div class="card-img-top bg-light d-flex align-items-center justify-content-center" 
                         style="height: 200px;">
                        <i class="fas fa-image text-muted" style="font-size: 3rem;"></i>
                    </div>
                `}
                <div class="card-body">
                    <h5 class="card-title">${problem.title}</h5>
                    <p class="card-text text-muted">${problem.description.substring(0, 100)}...</p>
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-primary">${problem.category}</span>
                        <span class="badge bg-${getStatusColor(problem.status)}">${problem.status}</span>
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
                            Posted by ${problem.userId?.username || 'Anonymous'}
                        </small>
                    </div>
                </div>
                <div class="card-footer bg-transparent">
                    <div class="d-flex justify-content-between align-items-center">
                        <small class="text-muted">ID: ${problem.problemId}</small>
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
        </div>
    `).join('');
}

// Helper function to get status color
function getStatusColor(status) {
    switch (status?.toLowerCase()) {
        case 'pending': return 'warning';
        case 'in progress': return 'info';
        case 'solved': return 'success';
        default: return 'secondary';
    }
}

// Handle Problem Submit
async function handleProblemSubmit(event) {
    if (!currentUser) {
        showAlert('Please log in to submit a problem', 'warning');
        showSection('login');
        return;
    }

    const form = event.target;
    const formData = new FormData(form);

    try {
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
        form.reset();
        form.classList.remove('was-validated');
        
        // Reset camera if it was used
        if (capturedImage && !capturedImage.classList.contains('d-none')) {
            retakePhoto();
        }

        // Switch to problems section and reload problems
        showSection('problems');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await loadProblems();

    } catch (error) {
        console.error('Error:', error);
        showAlert('Error submitting problem. Please try again.', 'danger');
        throw error;
    }
}

// Enhanced AI Suggestions
async function getAISuggestions() {
    const title = document.getElementById('title').value;
    const description = document.getElementById('description').value;
    const category = document.getElementById('category').value;

    if (!title || !description || !category) {
        showAlert('Please fill in the title, description, and category first', 'warning');
        return;
    }

    // Show modal with loading state
    const aiModal = new bootstrap.Modal(document.getElementById('aiSuggestionsModal'));
    aiModal.show();
    document.getElementById('aiSuggestionsContent').innerHTML = `
        <div class="d-flex justify-content-center">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
    `;

    try {
        // Prepare request data
        const requestData = {
            title,
            description,
            category
        };

        // Add image if available
        if (!capturedImage.classList.contains('d-none')) {
            requestData.imageBase64 = capturedImage.src;
        } else if (document.getElementById('problemImage').files[0]) {
            const imageFile = document.getElementById('problemImage').files[0];
            requestData.imageBase64 = await getBase64(imageFile);
        }

        const response = await fetch('/api/ai-suggestions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error('Failed to get AI suggestions');
        }

        const data = await response.json();
        document.getElementById('aiSuggestionsContent').innerHTML = `
            <div class="alert alert-${getSeverityClass(data.severity)}">
                <strong>Problem ID: ${data.problemId}</strong><br>
                Severity Level: ${data.severity}
            </div>
            <div class="ai-suggestions-content">
                ${marked.parse(data.suggestions)}
            </div>
        `;
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('aiSuggestionsContent').innerHTML = `
            <div class="alert alert-danger">
                Failed to get AI suggestions. Please try again.
            </div>
        `;
    }
}

// Utility Functions
function getSeverityClass(severity) {
    switch (severity?.toUpperCase()) {
        case 'HIGH': return 'danger';
        case 'MEDIUM': return 'warning';
        case 'LOW': return 'success';
        default: return 'info';
    }
}

async function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.querySelector('.container').insertBefore(alertDiv, document.querySelector('.container').firstChild);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

function showSuccess(message) {
    // Implement toast or alert for success message
    alert(message);
}

function showError(message) {
    // Implement toast or alert for error message
    alert(message);
}

// Vote on a Problem
async function voteProblem(problemId, vote) {
    if (!currentUser) {
        showAlert('Please login to vote', 'warning');
        showSection('login');
        return;
    }

    try {
        const response = await fetch(`/api/problems/${problemId}/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ vote })
        });

        if (!response.ok) {
            throw new Error('Failed to vote');
        }

        // Refresh the problems list to show updated votes
        loadProblems();
        showAlert('Vote recorded successfully!', 'success');
    } catch (error) {
        console.error('Error voting:', error);
        showAlert('Failed to vote. Please try again.', 'danger');
    }
}

// Camera Functions
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' },
            audio: false 
        });
        videoElement.srcObject = stream;
        videoElement.classList.remove('d-none');
        document.getElementById('startCamera').classList.add('d-none');
        document.getElementById('capturePhoto').classList.remove('d-none');
    } catch (error) {
        console.error('Error accessing camera:', error);
        showAlert('Error accessing camera. Please check permissions.', 'danger');
    }
}

function capturePhoto() {
    const context = photoCanvas.getContext('2d');
    photoCanvas.width = videoElement.videoWidth;
    photoCanvas.height = videoElement.videoHeight;
    context.drawImage(videoElement, 0, 0, photoCanvas.width, photoCanvas.height);
    
    // Display captured image
    capturedImage.src = photoCanvas.toDataURL('image/jpeg');
    capturedImage.classList.remove('d-none');
    
    // Hide video and show retake button
    videoElement.classList.add('d-none');
    document.getElementById('capturePhoto').classList.add('d-none');
    document.getElementById('retakePhoto').classList.remove('d-none');
    
    // Stop camera stream
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
}

function retakePhoto() {
    // Reset UI
    capturedImage.classList.add('d-none');
    document.getElementById('retakePhoto').classList.add('d-none');
    document.getElementById('startCamera').classList.remove('d-none');
    photoCanvas.getContext('2d').clearRect(0, 0, photoCanvas.width, photoCanvas.height);
}

// Show Problem Details
async function showProblemDetails(problemId) {
    try {
        const response = await fetch(`/api/problems/${problemId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch problem details');
        }
        const problem = await response.json();

        // Set the current problem ID for comments
        currentProblemId = problem._id;

        // Close any open modals
        const recentModal = bootstrap.Modal.getInstance(document.getElementById('recentSubmissionsModal'));
        if (recentModal) {
            recentModal.hide();
        }

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

// Toggle edit mode
function toggleEditMode() {
    const editFields = document.querySelectorAll('.edit-field');
    const displayFields = document.querySelectorAll('.card-title, .card-text, #problemDetailsCategory');
    const editButton = document.getElementById('editModeToggle');

    if (editFields[0].classList.contains('d-none')) {
        // Switch to edit mode
        editFields.forEach(field => field.classList.remove('d-none'));
        displayFields.forEach(field => field.classList.add('d-none'));
        editButton.innerHTML = '<i class="fas fa-times"></i> Cancel Edit';
        editButton.classList.replace('btn-primary', 'btn-secondary');
    } else {
        // Switch back to display mode
        editFields.forEach(field => field.classList.add('d-none'));
        displayFields.forEach(field => field.classList.remove('d-none'));
        editButton.innerHTML = '<i class="fas fa-edit"></i> Edit Problem';
        editButton.classList.replace('btn-secondary', 'btn-primary');
    }
}

// Save problem changes
async function saveChanges(problemId) {
    try {
        const updatedData = {
            title: document.getElementById('editTitle').value,
            description: document.getElementById('editDescription').value,
            category: document.getElementById('editCategory').value
        };

        const response = await fetch(`/api/problems/${problemId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update problem');
        }

        // Refresh the problem details and exit edit mode
        await showProblemDetails(problemId);
        showAlert('Problem updated successfully', 'success');
        
        // Refresh the problems list in the background
        loadProblems();
    } catch (error) {
        console.error('Error updating problem:', error);
        showAlert(error.message || 'Failed to update problem. Please try again.', 'danger');
    }
}

// Display Solutions
function displaySolutions(solutions) {
    const solutionsList = document.getElementById('solutionsList');
    solutionsList.innerHTML = solutions.map(solution => `
        <div class="solution-item">
            <p>${solution.description}</p>
            <div class="d-flex justify-content-between align-items-center">
                <small class="votes">
                    <i class="fas fa-arrow-up"></i> ${solution.votes} votes
                </small>
                <div>
                    <small class="text-muted">
                        By ${solution.userId?.username || 'Anonymous'}
                    </small>
                    <small class="text-muted ms-2">
                        ${new Date(solution.createdAt).toLocaleDateString()}
                    </small>
                </div>
            </div>
        </div>
    `).join('');
}

// Handle Solution Submit
async function handleSolutionSubmit(event) {
    event.preventDefault();
    
    if (!currentUser) {
        showError('Please login to submit a solution');
        problemModal.hide();
        showSection('login');
        return;
    }

    const solutionData = {
        description: document.getElementById('solutionDescription').value
    };

    try {
        const response = await fetch(`/api/problems/${currentProblemId}/solutions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(solutionData)
        });

        if (response.ok) {
            const problem = await response.json();
            displaySolutions(problem.solutions);
            solutionForm.reset();
            showSuccess('Solution submitted successfully');
        } else {
            throw new Error('Failed to submit solution');
        }
    } catch (error) {
        console.error('Error submitting solution:', error);
        showError('Failed to submit solution');
    }
}

// Load comments for a problem
async function loadComments(problemId) {
    try {
        const response = await fetch(`/api/problems/${problemId}/comments`);
        const comments = await response.json();
        
        const commentsList = document.getElementById('commentsList');
        commentsList.innerHTML = '';
        
        if (comments.length === 0) {
            commentsList.innerHTML = '<p class="text-muted">No comments yet. Be the first to comment!</p>';
            return;
        }
        
        comments.forEach(comment => {
            const commentElement = document.createElement('div');
            commentElement.className = 'comment border-bottom pb-2 mb-2';
            commentElement.innerHTML = `
                <div class="d-flex justify-content-between">
                    <strong>${comment.username || 'Anonymous'}</strong>
                    <small class="text-muted">${new Date(comment.createdAt).toLocaleString()}</small>
                </div>
                <p class="mb-1">${comment.text}</p>
            `;
            commentsList.appendChild(commentElement);
        });
    } catch (error) {
        console.error('Error loading comments:', error);
        showAlert('Error loading comments. Please try again.', 'danger');
    }
}

// Add a new comment
async function addComment(problemId) {
    if (!currentUser) {
        showAlert('Please login to comment', 'warning');
        showSection('login');
        return;
    }

    const commentText = document.getElementById('commentText').value.trim();
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
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to add comment');
        }

        // Clear the comment input
        document.getElementById('commentText').value = '';
        
        // Reload comments
        await loadComments(problemId);
        showAlert('Comment added successfully!', 'success');
    } catch (error) {
        console.error('Error adding comment:', error);
        showAlert(error.message || 'Failed to add comment. Please try again.', 'danger');
    }
}

// Add the updateProblemStatus function
async function updateProblemStatus(problemId, newStatus) {
    try {
        const response = await fetch(`/api/problems/${problemId}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update status');
        }

        // Refresh the problems list to show updated status
        loadProblems();
        showAlert(`Problem status updated to ${newStatus}`, 'success');
    } catch (error) {
        console.error('Error updating status:', error);
        showAlert(error.message || 'Failed to update status. Please try again.', 'danger');
    }
}

// Add delete problem function
async function deleteProblem(problemId) {
    if (!confirm('Are you sure you want to delete this problem?')) {
        return;
    }

    try {
        const response = await fetch(`/api/problems/delete/by-id/${problemId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete problem');
        }

        // Refresh the problems list
        loadProblems();
        showAlert('Problem deleted successfully', 'success');

        // Close the problem details modal if it's open
        const problemModal = bootstrap.Modal.getInstance(document.getElementById('problemModal'));
        if (problemModal) {
            problemModal.hide();
        }
    } catch (error) {
        console.error('Error deleting problem:', error);
        showAlert(error.message || 'Failed to delete problem. Please try again.', 'danger');
    }
}

// Add new function to filter and display problems
function filterAndDisplayProblems(category) {
    const filteredProblems = category === 'all' 
        ? allProblems 
        : allProblems.filter(problem => problem.category.toLowerCase() === category.toLowerCase());
    
    const problemsList = document.getElementById('problemsList');
    
    if (filteredProblems.length === 0) {
        problemsList.innerHTML = `
            <div class="col-12 text-center">
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    No problems found in the "${category}" category.
                </div>
            </div>
        `;
        return;
    }

    problemsList.innerHTML = filteredProblems.map(problem => `
        <div class="col-md-6 col-lg-4 mb-4">
            <div class="card h-100 shadow-sm">
                ${problem.image ? `
                    <img src="${problem.image}" class="card-img-top" alt="${problem.title}" 
                         style="height: 200px; object-fit: cover;">
                ` : `
                    <div class="card-img-top bg-light d-flex align-items-center justify-content-center" 
                         style="height: 200px;">
                        <i class="fas fa-image text-muted" style="font-size: 3rem;"></i>
                    </div>
                `}
                <div class="card-body">
                    <h5 class="card-title">${problem.title}</h5>
                    <p class="card-text text-muted">${problem.description.substring(0, 100)}...</p>
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="badge bg-primary">${problem.category}</span>
                        <span class="badge bg-${getStatusColor(problem.status)}">${problem.status}</span>
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
                            Posted by ${problem.userId?.username || 'Anonymous'}
                        </small>
                    </div>
                </div>
                <div class="card-footer bg-transparent">
                    <div class="d-flex justify-content-between align-items-center">
                        <small class="text-muted">ID: ${problem.problemId}</small>
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
        </div>
    `).join('');
}

// Add function to setup category filters
function setupCategoryFilters() {
    const categoryButtons = document.querySelectorAll('#categories-filter button');
    categoryButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            categoryButtons.forEach(btn => btn.classList.remove('active'));
            // Add active class to clicked button
            button.classList.add('active');
            // Update current category and filter problems
            currentCategory = button.getAttribute('data-category');
            filterAndDisplayProblems(currentCategory);
            
            // Add animation to the problems container
            const problemsList = document.getElementById('problemsList');
            problemsList.style.opacity = '0';
            setTimeout(() => {
                problemsList.style.transition = 'opacity 0.3s ease-in';
                problemsList.style.opacity = '1';
            }, 50);
        });
    });
}

// Add loading spinner functions
function showLoadingSpinner() {
    const problemsList = document.getElementById('problemsList');
    problemsList.innerHTML = `
        <div class="col-12 text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Loading problems...</p>
        </div>
    `;
}

function hideLoadingSpinner() {
    // The spinner will be replaced when problems are displayed
}

// Add function to show greeting toast
function showGreeting(username) {
    if (!username) {
        console.error('Username is undefined in showGreeting');
        return;
    }

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
        "Ready to create positive change? 🌈"
    ];
    const randomMessage = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];

    // Update greeting section first
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

    // Show toast notification
    try {
        // Create toast container if it doesn't exist
        let toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            document.body.appendChild(toastContainer);
        }

        // Create toast element
        const toastHtml = `
            <div id="greetingToast" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="toast-header bg-primary text-white">
                    <i class="fas fa-star me-2"></i>
                    <strong class="me-auto">Welcome Back!</strong>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
                <div class="toast-body">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-user-circle fs-3 me-2"></i>
                        <div>
                            <div class="fw-bold">${greeting}, ${username}! ${emoji}</div>
                            <small class="text-muted">Ready to make a difference in our community?</small>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add toast to container
        toastContainer.innerHTML = toastHtml;

        // Initialize and show the toast
        const toastElement = document.getElementById('greetingToast');
        const toast = new bootstrap.Toast(toastElement, {
            animation: true,
            autohide: true,
            delay: 6000
        });
        toast.show();

    } catch (error) {
        console.error('Error showing toast:', error);
        // Fallback to alert if toast fails
        showAlert(`${greeting}, ${username}! Welcome back!`, 'info');
    }
}

// Function to switch between login and register modals
function switchToRegister() {
    const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
    loginModal.hide();
    setTimeout(() => {
        const registerModal = new bootstrap.Modal(document.getElementById('registerModal'));
        registerModal.show();
    }, 200);
}

function switchToLogin() {
    const registerModal = bootstrap.Modal.getInstance(document.getElementById('registerModal'));
    registerModal.hide();
    setTimeout(() => {
        const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
        loginModal.show();
    }, 200);
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Update handleLogin function
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

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
            
            // Close the login modal first
            const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
            if (loginModal) {
                loginModal.hide();
            }
            
            // Update UI state
            await checkAuthStatus();
            
            // Show greeting with a slight delay to ensure modal is closed
            setTimeout(() => {
                showGreeting(currentUser.username);
            }, 300);
            
            // Switch to problems section
            showSection('problems');
            
            // Show success message
            showAlert('Logged in successfully!', 'success');
        } else {
            const data = await response.json();
            showAlert(data.error || 'Login failed', 'danger');
        }
    } catch (error) {
        console.error('Login error:', error);
        showAlert('Error logging in', 'danger');
    }
} 