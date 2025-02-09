const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const twilio = require('twilio');
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Not an image! Please upload an image.'), false);
        }
    }
});

const app = express();

// Middleware
app.use(cors({
    origin: true, // Allow all origins
    credentials: true
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: 'Something went wrong!',
        message: err.message 
    });
});

// Gemini AI Configuration
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyCtCQyX3WdqPg-X9KBXaXVHVS1h6H4HLLk');

// Twilio Configuration
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID || 'ACb88e7f629bee8dd022c7788351bc0ba2',
    process.env.TWILIO_AUTH_TOKEN || 'eXHmozx1sfNxmizniRboaP6kAE0KNScr'
);

// MongoDB Connection
const mongoURI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hack-a-problem';
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB successfully');
}).catch((err) => {
    console.error('MongoDB connection error:', err);
});

// User Schema
const UserSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters long']
    },
    email: { 
        type: String, 
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: { 
        type: String, 
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters long']
    },
    createdAt: { type: Date, default: Date.now }
});

// Problem Schema
const ProblemSchema = new mongoose.Schema({
    title: String,
    description: String,
    image: String,
    location: {
        latitude: Number,
        longitude: Number,
        address: String
    },
    category: String,
    status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Solved'],
        default: 'Pending'
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    votes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    comments: [{
        text: String,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
        createdAt: { type: Date, default: Date.now }
    }],
    solutions: [{
        description: String,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        votes: { type: Number, default: 0 },
        createdAt: { type: Date, default: Date.now }
    }],
    aiSuggestions: String,
    problemId: String,
    severity: String
});

const User = mongoose.model('User', UserSchema);
const Problem = mongoose.model('Problem', ProblemSchema);

// Authentication Middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
};

// Validation middleware
const validateRegistration = (req, res, next) => {
    const { username, email, password } = req.body;

    // Validate username
    if (!username || username.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters long' });
    }

    // Validate email
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!email || !emailRegex.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Validate password
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    next();
};

// Auth Routes
app.post('/api/auth/register', validateRegistration, async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            if (existingUser.username === username) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            if (existingUser.email === email) {
                return res.status(400).json({ error: 'Email already exists' });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new user
        const user = new User({
            username,
            email,
            password: hashedPassword
        });
        
        await user.save();
        
        // Start session
        req.session.userId = user._id;
        
        // Send response without password
        const userResponse = {
            _id: user._id,
            username: user.username,
            email: user.email,
            createdAt: user.createdAt
        };
        
        res.status(201).json({ 
            message: 'User registered successfully',
            user: userResponse
        });
    } catch (error) {
        console.error('Registration error:', error);
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            res.status(400).json({ error: messages.join(', ') });
        } else {
            res.status(500).json({ error: 'Error registering user. Please try again.' });
        }
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Find user
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Check password
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Start session
        req.session.userId = user._id;
        
        res.json({ message: 'Logged in successfully' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Error logging in' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Logged out successfully' });
});

// Get current user
app.get('/api/auth/user', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching user' });
    }
});

// Problem Routes
app.get('/api/problems', async (req, res) => {
    try {
        let query = {};
        
        // If problemId is provided, add it to the query
        if (req.query.problemId) {
            query.problemId = req.query.problemId;
        }

        const problems = await Problem.find(query)
            .sort({ createdAt: -1 })
            .populate('userId', 'username')
            .populate('solutions.userId', 'username')
            .lean(); // Use lean() for better performance

        if (!problems || problems.length === 0) {
            return res.status(404).json({ error: 'No problems found' });
        }

        // Transform the data to ensure all required fields are present
        const transformedProblems = problems.map(problem => ({
            _id: problem._id,
            title: problem.title || 'Untitled Problem',
            description: problem.description || 'No description provided',
            image: problem.image || null,
            category: problem.category || 'Uncategorized',
            status: problem.status || 'Pending',
            votes: problem.votes || 0,
            createdAt: problem.createdAt,
            userId: problem.userId || { username: 'Anonymous' },
            solutions: problem.solutions || [],
            location: problem.location || {},
            severity: problem.severity || 'MEDIUM',
            problemId: problem.problemId || `PROB-${problem._id.toString().substr(-6)}`
        }));

        res.json(transformedProblems);
    } catch (error) {
        console.error('Error fetching problems:', error);
        res.status(500).json({ 
            error: 'Error fetching problems',
            message: error.message
        });
    }
});

// Get a single problem by ID
app.get('/api/problems/:id', async (req, res) => {
    try {
        const problem = await Problem.findById(req.params.id)
            .populate('userId', 'username')
            .populate('solutions.userId', 'username')
            .lean();

        if (!problem) {
            return res.status(404).json({ error: 'Problem not found' });
        }

        // Transform the data to ensure all required fields are present
        const transformedProblem = {
            _id: problem._id,
            title: problem.title || 'Untitled Problem',
            description: problem.description || 'No description provided',
            image: problem.image || null,
            category: problem.category || 'Uncategorized',
            status: problem.status || 'Pending',
            votes: problem.votes || 0,
            createdAt: problem.createdAt,
            userId: problem.userId || { username: 'Anonymous' },
            solutions: problem.solutions || [],
            location: problem.location || {},
            severity: problem.severity || 'MEDIUM',
            problemId: problem.problemId || `PROB-${problem._id.toString().substr(-6)}`,
            aiSuggestions: problem.aiSuggestions || null,
            comments: problem.comments || []
        };

        res.json(transformedProblem);
    } catch (error) {
        console.error('Error fetching problem:', error);
        res.status(500).json({ 
            error: 'Error fetching problem',
            message: error.message
        });
    }
});

// Helper function to get AI model
function getAIModel(requiresVision = false) {
    return genAI.getGenerativeModel({ 
        model: requiresVision ? "gemini-pro-vision" : "gemini-pro"
    });
}

// Helper function to get AI suggestions
async function getAISuggestions(problem) {
    try {
        // Set a timeout for AI response
        const timeoutDuration = 10000; // 10 seconds
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AI suggestion timeout')), timeoutDuration);
        });

        const model = getAIModel();
        const prompt = `Quick analysis of community problem:
        Title: ${problem.title}
        Description: ${problem.description}
        Category: ${problem.category}
        
        Provide a brief:
        1. Severity Assessment (HIGH/MEDIUM/LOW)
        2. Quick Analysis (2-3 lines)
        3. Immediate Actions (2-3 points)
        4. Long-term Solutions (1-2 points)

        Keep the response concise and actionable.`;

        const aiPromise = model.generateContent(prompt);
        const result = await Promise.race([aiPromise, timeoutPromise]);
        
        return result.response.text();
    } catch (error) {
        console.error('Error getting AI suggestions:', error);
        // Return a default response if AI fails
        return `## Quick Analysis
- Severity: MEDIUM
- This issue requires attention based on the provided description.

### Recommended Actions
1. Document and assess the situation
2. Engage relevant stakeholders
3. Monitor for developments

### Long-term Considerations
- Implement preventive measures
- Regular monitoring and maintenance`;
    }
}

// Update problem submission endpoint
app.post('/api/problems', isAuthenticated, upload.single('image'), async (req, res) => {
    try {
        const problemData = {
            ...req.body,
            userId: req.session.userId,
            problemId: 'PROB-' + Math.random().toString(36).substr(2, 9).toUpperCase()
        };

        if (req.file) {
            problemData.image = `/uploads/${req.file.filename}`;
        }

        // Create and save the problem first
        const problem = new Problem(problemData);
        await problem.save();

        // Get AI suggestions in the background
        getAISuggestions(problemData).then(async (suggestions) => {
            problem.aiSuggestions = suggestions;
            await problem.save();
        }).catch(console.error);

        // Send immediate response with problem ID
        res.status(201).json({
            ...problem.toObject(),
            message: 'Problem submitted successfully'
        });

        // Try to send SMS notification in background
        try {
            if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
                twilioClient.messages.create({
                    body: `New problem reported: ${problem.problemId}\nTitle: ${problem.title}\nSeverity: ${problem.severity}`,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: process.env.AUTHORITY_PHONE_NUMBER
                }).catch(console.error);
            }
        } catch (twilioError) {
            console.error('Error sending SMS:', twilioError);
        }
    } catch (error) {
        console.error('Error creating problem:', error);
        res.status(500).json({ error: 'Error creating problem' });
    }
});

app.post('/api/problems/:id/solutions', isAuthenticated, async (req, res) => {
    try {
        const problem = await Problem.findById(req.params.id);
        if (!problem) {
            return res.status(404).json({ error: 'Problem not found' });
        }
        problem.solutions.push({
            ...req.body,
            userId: req.session.userId
        });
        await problem.save();
        res.json(problem);
    } catch (error) {
        console.error('Error adding solution:', error);
        res.status(500).json({ error: 'Error adding solution' });
    }
});

// Update AI suggestions endpoint
app.post('/api/ai-suggestions', async (req, res) => {
    try {
        const { title, description, category, imageBase64 } = req.body;
        
        let prompt = `Analyze this problem:
        Title: "${title}"
        Description: "${description}"
        Category: "${category}"

        Please provide:
        1. Problem Analysis:
           - Quick assessment of the situation
           - Severity level (Low/Medium/High)
           - Potential immediate risks

        2. Immediate Actions:
           - List 2-3 immediate steps that can be taken
           - Include any safety precautions if applicable

        3. Long-term Solutions:
           - Provide 2-3 comprehensive solutions
           - Consider cost and implementation time
           - List potential challenges

        4. Similar Cases & Success Stories:
           - Reference similar problems that were solved
           - Share successful approaches

        5. Prevention Tips:
           - How to prevent similar issues
           - Maintenance recommendations

        Format the response in a clear, structured way with bullet points and emphasis on critical information.`;

        let result;
        try {
            if (imageBase64) {
                const model = getAIModel(true);
                const imageData = {
                    inlineData: {
                        data: imageBase64.split(',')[1],
                        mimeType: 'image/jpeg'
                    }
                };
                result = await model.generateContent([prompt, imageData]);
            } else {
                const model = getAIModel(false);
                result = await model.generateContent(prompt);
            }

            const suggestions = result.response.text();
            const problemId = 'PROB-' + Math.random().toString(36).substr(2, 9).toUpperCase();
            
            res.json({ 
                problemId,
                suggestions,
                timestamp: new Date(),
                severity: determineSeverity(suggestions)
            });
        } catch (aiError) {
            console.error('Error getting AI suggestions:', aiError);
            // Provide a fallback response
            res.json({
                problemId: 'PROB-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
                suggestions: "AI analysis is currently unavailable. Please try again later or proceed with problem submission.",
                timestamp: new Date(),
                severity: "MEDIUM"
            });
        }
    } catch (error) {
        console.error('Error in AI suggestions endpoint:', error);
        res.status(500).json({ error: 'Error getting AI suggestions' });
    }
});

// Helper function to determine severity from AI suggestions
function determineSeverity(suggestions) {
    const lowKeywords = ['minor', 'low', 'minimal', 'routine'];
    const highKeywords = ['critical', 'severe', 'urgent', 'immediate', 'dangerous'];
    
    const text = suggestions.toLowerCase();
    
    if (highKeywords.some(keyword => text.includes(keyword))) {
        return 'HIGH';
    } else if (lowKeywords.some(keyword => text.includes(keyword))) {
        return 'LOW';
    }
    return 'MEDIUM';
}

// Update problem status
app.patch('/api/problems/:id/status', isAuthenticated, async (req, res) => {
    try {
        const problem = await Problem.findById(req.params.id);
        if (!problem) {
            return res.status(404).json({ error: 'Problem not found' });
        }

        // Check if the current user is the owner of the problem
        if (problem.userId.toString() !== req.session.userId) {
            return res.status(403).json({ error: 'Only the problem owner can update the status' });
        }

        // Validate status
        const validStatuses = ['Pending', 'In Progress', 'Solved'];
        if (!validStatuses.includes(req.body.status)) {
            return res.status(400).json({ error: 'Invalid status. Must be one of: Pending, In Progress, Solved' });
        }

        problem.status = req.body.status;
        await problem.save();
        
        res.json(problem);
    } catch (error) {
        console.error('Error updating problem status:', error);
        res.status(500).json({ error: 'Error updating problem status' });
    }
});

// Vote on a problem
app.post('/api/problems/:id/vote', async (req, res) => {
    try {
        const problem = await Problem.findById(req.params.id);
        if (!problem) {
            return res.status(404).json({ error: 'Problem not found' });
        }
        problem.votes += req.body.vote;
        await problem.save();
        res.json(problem);
    } catch (error) {
        console.error('Error voting on problem:', error);
        res.status(500).json({ error: 'Error voting on problem' });
    }
});

// Add comment to a problem
app.post('/api/problems/:id/comments', isAuthenticated, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Comment text is required' });
        }

        const problem = await Problem.findById(req.params.id);
        if (!problem) {
            return res.status(404).json({ error: 'Problem not found' });
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const comment = {
            text,
            userId: user._id,
            username: user.username,
            createdAt: new Date()
        };

        problem.comments.push(comment);
        await problem.save();

        res.status(201).json(comment);
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ error: 'Error adding comment' });
    }
});

// Get comments for a problem
app.get('/api/problems/:id/comments', async (req, res) => {
    try {
        const problem = await Problem.findById(req.params.id)
            .select('comments')
            .populate('comments.userId', 'username');
            
        if (!problem) {
            return res.status(404).json({ error: 'Problem not found' });
        }

        res.json(problem.comments);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ error: 'Error fetching comments' });
    }
});

// Delete a problem by ID
app.delete('/api/problems/:id', isAuthenticated, async (req, res) => {
    try {
        const problem = await Problem.findByIdAndDelete(req.params.id);
        if (!problem) {
            return res.status(404).json({ error: 'Problem not found' });
        }
        res.json({ message: 'Problem deleted successfully' });
    } catch (error) {
        console.error('Error deleting problem:', error);
        res.status(500).json({ error: 'Failed to delete problem' });
    }
});

// Delete most recent problem
app.delete('/api/problems/delete/most-recent', isAuthenticated, async (req, res) => {
    try {
        const mostRecentProblem = await Problem.findOne().sort({ createdAt: -1 });
        if (!mostRecentProblem) {
            return res.status(404).json({ error: 'No problems found' });
        }
        await Problem.findByIdAndDelete(mostRecentProblem._id);
        res.json({ message: 'Most recent problem deleted successfully' });
    } catch (error) {
        console.error('Error deleting most recent problem:', error);
        res.status(500).json({ error: 'Failed to delete most recent problem' });
    }
});

// Delete problems by problemId
app.delete('/api/problems/delete/by-id/:problemId', async (req, res) => {
    try {
        const problem = await Problem.findOneAndDelete({ problemId: req.params.problemId });
        if (!problem) {
            return res.status(404).json({ error: `Problem with ID ${req.params.problemId} not found` });
        }
        res.json({ message: `Problem ${req.params.problemId} deleted successfully` });
    } catch (error) {
        console.error('Error deleting problem:', error);
        res.status(500).json({ error: 'Failed to delete problem' });
    }
});

// Delete multiple problems by problemIds
app.delete('/api/problems/delete/multiple', async (req, res) => {
    try {
        const { problemIds } = req.body;
        
        if (!Array.isArray(problemIds) || problemIds.length === 0) {
            return res.status(400).json({ error: 'Please provide an array of problem IDs' });
        }

        const result = await Problem.deleteMany({ problemId: { $in: problemIds } });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'No problems found with the provided IDs' });
        }

        res.json({ 
            message: `Successfully deleted ${result.deletedCount} problems`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Error deleting problems:', error);
        res.status(500).json({ error: 'Failed to delete problems' });
    }
});

// Update problem details
app.patch('/api/problems/:id', isAuthenticated, async (req, res) => {
    try {
        const problem = await Problem.findById(req.params.id);
        if (!problem) {
            return res.status(404).json({ error: 'Problem not found' });
        }

        // Check if the current user is the owner of the problem
        if (problem.userId.toString() !== req.session.userId) {
            return res.status(403).json({ error: 'Only the problem owner can update the details' });
        }

        // Update allowed fields
        const allowedUpdates = ['title', 'description', 'category'];
        const updates = Object.keys(req.body)
            .filter(key => allowedUpdates.includes(key))
            .reduce((obj, key) => {
                obj[key] = req.body[key];
                return obj;
            }, {});

        // Apply updates
        Object.assign(problem, updates);
        await problem.save();

        // Get AI suggestions for the updated problem
        const newSuggestions = await getAISuggestions(problem);
        problem.aiSuggestions = newSuggestions;
        await problem.save();
        
        res.json(problem);
    } catch (error) {
        console.error('Error updating problem:', error);
        res.status(500).json({ error: 'Error updating problem' });
    }
});

// Serve the main page for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Sample problems data
const sampleProblems = [
    {
        title: "Broken Street Light",
        description: "Street light at the main intersection has been non-functional for several days, creating safety concerns for pedestrians and drivers during night time.",
        category: "INFRASTRUCTURE",
        status: "Pending",
        severity: "MEDIUM",
        image: "/uploads/streetlight.jpg",
        location: {
            latitude: 28.6139,
            longitude: 77.2090,
            address: "Main Street Intersection"
        },
        votes: 15,
        problemId: "PROB-LIGHT001"
    },
    {
        title: "Water Pipeline Leakage",
        description: "Major water pipeline leakage causing water wastage and creating puddles on the road. Needs immediate attention to prevent water loss and road damage.",
        category: "UTILITIES",
        status: "In Progress",
        severity: "HIGH",
        image: "/uploads/pipeline.jpg",
        location: {
            latitude: 28.6129,
            longitude: 77.2295,
            address: "Park Road Junction"
        },
        votes: 28,
        problemId: "PROB-WATER001"
    },
    {
        title: "Garbage Dump Overflow",
        description: "Community garbage dump is overflowing, causing hygiene issues and foul smell in the area. Regular cleanup needed.",
        category: "ENVIRONMENT",
        status: "Pending",
        severity: "HIGH",
        image: "/uploads/garbage.jpg",
        location: {
            latitude: 28.6219,
            longitude: 77.2190,
            address: "Community Park Area"
        },
        votes: 22,
        problemId: "PROB-GARB001"
    }
];

// Sample images URLs
const sampleImages = {
    'streetlight.jpg': 'https://images.unsplash.com/photo-1542203519-615a6fb5a77f',
    'pipeline.jpg': 'https://images.unsplash.com/photo-1584677626646-7c8f83690304',
    'garbage.jpg': 'https://images.unsplash.com/photo-1605600659908-0ef719419d41'
};

// Function to download and save sample images
async function downloadSampleImages() {
    const https = require('https');
    const path = require('path');
    
    for (const [filename, url] of Object.entries(sampleImages)) {
        const filePath = path.join(__dirname, 'public/uploads', filename);
        
        // Skip if file already exists
        if (fs.existsSync(filePath)) {
            continue;
        }
        
        // Download and save the image
        await new Promise((resolve, reject) => {
            https.get(url, (response) => {
                const fileStream = fs.createWriteStream(filePath);
                response.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve();
                });
            }).on('error', reject);
        });
    }
}

// Initialize sample data when server starts
async function initializeSampleData() {
    try {
        // Ensure uploads directory exists
        const uploadDir = path.join(__dirname, 'public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        // Check if we already have problems
        const existingProblems = await Problem.countDocuments();
        if (existingProblems === 0) {
            // Download sample images
            await downloadSampleImages();
            
            // Create sample problems
            const problems = await Problem.insertMany(sampleProblems);
            
            console.log(`Initialized ${problems.length} sample problems successfully`);
        }
    } catch (error) {
        console.error('Error initializing sample data:', error);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    try {
        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected to MongoDB successfully');
        
        // Initialize sample data after connecting to MongoDB
        await initializeSampleData();
    } catch (err) {
        console.error('MongoDB connection error:', err);
    }
}); 