// server.js
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

// App & Middleware
const app = express();
app.use(cors());
app.use(express.json());

// JWT Secret (usar .env en producción)
const JWT_SECRET = process.env.JWT_SECRET || 'clave-secreta-bootcamp-2025';

// ========== CONEXIÓN A MONGODB ATLAS ==========
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://<usuario>:<contraseña>@cluster0.xxxxx.mongodb.net/cursos_oficios?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas'))
  .catch((err) => console.error('❌ Error conectando a MongoDB:', err));

// ========== MODELOS ==========
// User Model
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['teacher', 'student', 'admin'], default: 'student' },
  skills: [String] // oficios que domina
});
const User = mongoose.model('User', userSchema);

// Course Model
const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  duration: { type: Number, required: true }, // en horas
  maxStudents: { type: Number, default: 20 },
  enrolled: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['open', 'closed', 'completed'], default: 'open' }
});
const Course = mongoose.model('Course', courseSchema);

// Enrollment Model
const enrollmentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  enrolledAt: { type: Date, default: Date.now }
});
const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

// Attendance Model
const attendanceSchema = new mongoose.Schema({
  enrollment: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment', required: true },
  sessionDate: { type: Date, required: true },
  present: { type: Boolean, default: false }
});
const Attendance = mongoose.model('Attendance', attendanceSchema);

// Review Model
const reviewSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // student
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // teacher
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String },
  createdAt: { type: Date, default: Date.now }
});
const Review = mongoose.model('Review', reviewSchema);

// ========== MIDDLEWARE DE AUTENTICACIÓN ==========
const auth = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ msg: 'Acceso denegado. Token requerido.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ msg: 'Token inválido.' });
  }
};

// ========== RUTAS ==========
// Registro de usuarios
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, skills } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'El usuario ya existe.' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({ name, email, password: hashedPassword, role, skills });
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user._id, name, email, role } });
  } catch (err) {
    res.status(500).json({ msg: 'Error en el servidor.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Credenciales inválidas.' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Credenciales inválidas.' });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email, role: user.role } });
  } catch (err) {
    res.status(500).json({ msg: 'Error en el servidor.' });
  }
});

// Obtener perfil
app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ msg: 'Usuario no encontrado.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: 'Error al obtener perfil.' });
  }
});

// ========== GESTIÓN DE CURSOS (CRUD) ==========
// Crear curso (solo profesores)
app.post('/api/courses', auth, async (req, res) => {
  if (req.user.role !== 'teacher') return res.status(403).json({ msg: 'Solo maestros pueden crear cursos.' });

  const { title, description, date, duration, maxStudents } = req.body;
  try {
    const course = new Course({
      title,
      description,
      teacher: req.user.id,
      date,
      duration,
      maxStudents
    });
    await course.save();
    res.status(201).json(course);
  } catch (err) {
    res.status(500).json({ msg: 'Error al crear curso.' });
  }
});

// Listar todos los cursos (abiertos)
app.get('/api/courses', async (req, res) => {
  try {
    const courses = await Course.find({ status: 'open' })
      .populate('teacher', 'name email')
      .populate('enrolled', 'name');
    res.json(courses);
  } catch (err) {
    res.status(500).json({ msg: 'Error al obtener cursos.' });
  }
});

// Obtener curso por ID
app.get('/api/courses/:id', async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('teacher', 'name email')
      .populate('enrolled', 'name');
    if (!course) return res.status(404).json({ msg: 'Curso no encontrado.' });
    res.json(course);
  } catch (err) {
    res.status(500).json({ msg: 'Error al obtener curso.' });
  }
});

// Actualizar curso (solo el maestro)
app.put('/api/courses/:id', auth, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ msg: 'Curso no encontrado.' });
    if (course.teacher.toString() !== req.user.id) return res.status(403).json({ msg: 'Acceso denegado.' });

    Object.assign(course, req.body);
    await course.save();
    res.json(course);
  } catch (err) {
    res.status(500).json({ msg: 'Error al actualizar curso.' });
  }
});

// Eliminar curso (solo admin o maestro)
app.delete('/api/courses/:id', auth, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ msg: 'Curso no encontrado.' });
    if (course.teacher.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Acceso denegado.' });
    }
    await course.remove();
    res.json({ msg: 'Curso eliminado.' });
  } catch (err) {
    res.status(500).json({ msg: 'Error al eliminar curso.' });
  }
});

// ========== INSCRIPCIÓN A CURSOS ==========
app.post('/api/enrollments', auth, async (req, res) => {
  const { courseId } = req.body;
  try {
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ msg: 'Curso no encontrado.' });
    if (course.status !== 'open') return res.status(400).json({ msg: 'Curso no disponible.' });
    if (course.enrolled.includes(req.user.id)) return res.status(400).json({ msg: 'Ya estás inscrito.' });
    if (course.enrolled.length >= course.maxStudents) return res.status(400).json({ msg: 'Curso lleno.' });

    // Crear inscripción
    const enrollment = new Enrollment({ student: req.user.id, course: courseId });
    await enrollment.save();

    // Actualizar curso
    course.enrolled.push(req.user.id);
    await course.save();

    res.status(201).json(enrollment);
  } catch (err) {
    res.status(500).json({ msg: 'Error al inscribirse.' });
  }
});

// Listar inscripciones del estudiante
app.get('/api/enrollments/my', auth, async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ student: req.user.id })
      .populate('course', 'title description date duration');
    res.json(enrollments);
  } catch (err) {
    res.status(500).json({ msg: 'Error al obtener inscripciones.' });
  }
});

// ========== CONTROL DE ASISTENCIA (Simulado - por el maestro) ==========
app.post('/api/attendance', auth, async (req, res) => {
  const { enrollmentId, present, sessionDate } = req.body;
  try {
    const enrollment = await Enrollment.findById(enrollmentId).populate('course');
    if (!enrollment) return res.status(404).json({ msg: 'Inscripción no encontrada.' });

    const course = enrollment.course;
    if (course.teacher.toString() !== req.user.id) return res.status(403).json({ msg: 'Solo el maestro puede registrar asistencia.' });

    let attendance = await Attendance.findOne({ enrollment: enrollmentId, sessionDate });
    if (!attendance) {
      attendance = new Attendance({ enrollment: enrollmentId, sessionDate, present });
    } else {
      attendance.present = present;
    }
    await attendance.save();
    res.json(attendance);
  } catch (err) {
    res.status(500).json({ msg: 'Error al registrar asistencia.' });
  }
});

// Listar asistencia de un curso
app.get('/api/attendance/course/:courseId', auth, async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course || course.teacher.toString() !== req.user.id) return res.status(403).json({ msg: 'Acceso denegado.' });

    const enrollments = await Enrollment.find({ course: req.params.courseId }).populate('student', 'name');
    const attendanceRecords = await Promise.all(
      enrollments.map(async (e) => {
        const records = await Attendance.find({ enrollment: e._id });
        return { student: e.student, records };
      })
    );
    res.json(attendanceRecords);
  } catch (err) {
    res.status(500).json({ msg: 'Error al obtener asistencia.' });
  }
});

// ========== VALORACIONES ==========
app.post('/api/reviews', auth, async (req, res) => {
  const { courseId, rating, comment } = req.body;
  try {
    const course = await Course.findById(courseId).populate('teacher');
    if (!course) return res.status(404).json({ msg: 'Curso no encontrado.' });

    const enrollment = await Enrollment.findOne({ student: req.user.id, course: courseId });
    if (!enrollment) return res.status(403).json({ msg: 'Debes haber completado el curso.' });

    const existing = await Review.findOne({ reviewer: req.user.id, course: courseId });
    if (existing) return res.status(400).json({ msg: 'Ya valoraste este curso.' });

    const review = new Review({
      course: courseId,
      reviewer: req.user.id,
      teacher: course.teacher._id,
      rating,
      comment
    });
    await review.save();
    res.status(201).json(review);
  } catch (err) {
    res.status(500).json({ msg: 'Error al crear valoración.' });
  }
});

// Listar valoraciones de un curso
app.get('/api/reviews/course/:courseId', async (req, res) => {
  try {
    const reviews = await Review.find({ course: req.params.courseId })
      .populate('reviewer', 'name')
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ msg: 'Error al obtener valoraciones.' });
  }
});

// Puerto
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});

module.exports = app;