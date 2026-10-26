import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';

const app = express();
const port = process.env.PORT || 5001;
const secret = process.env.JWT_SECRET || 'dev-access-secret';
const refreshSecret = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '2mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_, file, cb) => cb(null, file.mimetype === 'application/pdf') });

const userSchema = new mongoose.Schema({ name: { type: String, required: true }, email: { type: String, required: true, unique: true, lowercase: true }, password: { type: String, required: true, select: false }, role: { type: String, default: 'candidate' }, resumeUrl: String, resumeText: String, skills: [String], targetRole: String, experience: String }, { timestamps: true });
const questionSchema = new mongoose.Schema({ text: String, category: { type: String, enum: ['HR', 'Technical', 'Behavioral', 'DSA'] }, difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'] } }, { _id: false });
const interviewSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, role: String, difficulty: String, questions: [questionSchema], answers: [String], feedback: mongoose.Schema.Types.Mixed, score: Number }, { timestamps: true });
const loginEventSchema = new mongoose.Schema({ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, email: String, ip: String, userAgent: String, success: Boolean, loggedInAt: { type: Date, default: Date.now } });
const User = mongoose.model('User', userSchema);
const Interview = mongoose.model('Interview', interviewSchema);
const LoginEvent = mongoose.model('LoginEvent', loginEventSchema);
const databaseRequired = (_req, res, next) => mongoose.connection.readyState === 1 ? next() : res.status(503).json({ message: 'Database is not connected. Start MongoDB or run docker compose up mongo.' });
const token = (user, type = 'access') => jwt.sign({ id: user._id, email: user.email }, type === 'access' ? secret : refreshSecret, { expiresIn: type === 'access' ? '15m' : '7d' });
const publicUser = user => ({ id: user._id, name: user.name, email: user.email, role: user.role, resumeUrl: user.resumeUrl, skills: user.skills, targetRole: user.targetRole, experience: user.experience });
const auth = (req, res, next) => { try { const value = req.headers.authorization?.replace('Bearer ', ''); if (!value) return res.status(401).json({ message: 'Authentication required' }); req.user = jwt.verify(value, secret); next(); } catch { res.status(401).json({ message: 'Invalid or expired token' }); } };
const sampleQuestions = (role, difficulty, category) => [{ text: `Tell me about a project that best shows your impact as a ${role}.`, category: category === 'Mixed' ? 'Behavioral' : category, difficulty }, { text: `How would you design a reliable, scalable system relevant to ${role}?`, category: category === 'Mixed' ? 'Technical' : category, difficulty }, { text: 'Tell me about a difficult tradeoff you made and what you learned.', category: 'HR', difficulty }];

app.get('/api/health', (_, res) => res.json({ status: 'ok', service: 'InterviewAI API' }));
app.post('/api/auth/signup', databaseRequired, async (req, res, next) => { try { const { name, email, password } = req.body; if (!name || !email || !password || password.length < 8) return res.status(400).json({ message: 'Name, email, and an 8-character password are required' }); if (await User.findOne({ email })) return res.status(409).json({ message: 'An account with that email already exists' }); const user = await User.create({ name, email, password: await bcrypt.hash(password, 12) }); res.status(201).json({ user: publicUser(user), accessToken: token(user), refreshToken: token(user, 'refresh') }); } catch (error) { next(error); } });
app.post('/api/auth/login', databaseRequired, async (req, res, next) => { try { const user = await User.findOne({ email: req.body.email }).select('+password'); const valid = user && await bcrypt.compare(req.body.password || '', user.password); await LoginEvent.create({ userId: user?._id, email: req.body.email, ip: req.ip, userAgent: req.get('user-agent'), success: Boolean(valid) }); if (!valid) return res.status(401).json({ message: 'Invalid email or password' }); res.json({ user: publicUser(user), accessToken: token(user), refreshToken: token(user, 'refresh') }); } catch (error) { next(error); } });
app.post('/api/auth/refresh', (req, res) => { try { const decoded = jwt.verify(req.body.refreshToken, refreshSecret); res.json({ accessToken: jwt.sign({ id: decoded.id }, secret, { expiresIn: '15m' }) }); } catch { res.status(401).json({ message: 'Invalid refresh token' }); } });
app.get('/api/auth/me', auth, async (req, res, next) => { try { res.json({ user: publicUser(await User.findById(req.user.id)) }); } catch (error) { next(error); } });
app.get('/api/admin/login-events', auth, async (req, res, next) => { try { const viewer = await User.findById(req.user.id); if (viewer?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' }); res.json(await LoginEvent.find().sort({ loggedInAt: -1 }).limit(100).populate('userId', 'name email')); } catch (error) { next(error); } });
app.patch('/api/users/me', auth, async (req, res, next) => { try { const allowed = ['name', 'targetRole', 'experience', 'skills']; const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key))); res.json({ user: publicUser(await User.findByIdAndUpdate(req.user.id, updates, { new: true })) }); } catch (error) { next(error); } });
app.post('/api/resumes', auth, upload.single('resume'), async (req, res, next) => { try { if (!req.file) return res.status(400).json({ message: 'A PDF resume is required' }); const text = req.file.buffer.toString('latin1').slice(0, 10000); const skills = ['JavaScript', 'React', 'Node.js', 'TypeScript', 'System design'].filter(skill => text.toLowerCase().includes(skill.toLowerCase())); const user = await User.findByIdAndUpdate(req.user.id, { resumeUrl: `local://${req.file.originalname}`, resumeText: text, skills: skills.length ? skills : ['Communication', 'Problem solving'] }, { new: true }); res.json({ user: publicUser(user), extractedSkills: user.skills }); } catch (error) { next(error); } });
app.post('/api/interviews/generate', auth, async (req, res, next) => { try { const { role = 'Software Engineer', difficulty = 'Medium', category = 'Mixed' } = req.body; res.status(201).json(await Interview.create({ userId: req.user.id, role, difficulty, questions: sampleQuestions(role, difficulty, category) })); } catch (error) { next(error); } });
app.post('/api/interviews/:id/feedback', auth, async (req, res, next) => { try { const interview = await Interview.findOne({ _id: req.params.id, userId: req.user.id }); if (!interview) return res.status(404).json({ message: 'Interview not found' }); interview.answers = req.body.answers || []; interview.feedback = { overall: 86, communication: 88, technical: 84, confidence: 79, strengths: ['Clear structure', 'Specific examples', 'Strong product context'], weaknesses: ['Pause before answering', 'Close with measurable outcomes'], improvedAnswer: 'I led the migration to a scalable frontend foundation, reducing load time by 42% and enabling three new product lines.' }; interview.score = interview.feedback.overall; await interview.save(); res.json(interview); } catch (error) { next(error); } });
app.get('/api/interviews', auth, async (req, res, next) => { try { res.json(await Interview.find({ userId: req.user.id }).sort({ createdAt: -1 })); } catch (error) { next(error); } });
app.delete('/api/interviews/:id', auth, async (req, res, next) => { try { await Interview.deleteOne({ _id: req.params.id, userId: req.user.id }); res.status(204).end(); } catch (error) { next(error); } });
app.use((error, _req, res, _next) => { console.error(error); res.status(500).json({ message: error.message || 'Something went wrong' }); });

const connectDatabase = async () => { if (process.env.MONGODB_URI && mongoose.connection.readyState !== 1) await mongoose.connect(process.env.MONGODB_URI); };
const start = async () => { if (process.env.MONGODB_URI) await connectDatabase(); else console.warn('MONGODB_URI not configured; API starts without database'); app.listen(port, () => console.log(`InterviewAI API listening on ${port}`)); };
export { app, connectDatabase };
if (!process.env.VERCEL) start().catch(error => { console.error(error); process.exit(1); });
