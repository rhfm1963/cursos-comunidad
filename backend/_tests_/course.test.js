// ========== PRUEBAS CON JEST (ejemplo en archivo separado, pero aquí el setup) ==========
// Archivo: __tests__/course.test.js
const request = require('supertest');
const app = require('../server');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const User = require('../models/User');

describe('Courses API', () => {
  let token, teacherId;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI_TEST);
  });

  beforeEach(async () => {
    const user = new User({
      name: 'Profesor 1',
      email: 'prof@comunidad.com',
      password: '123456',
      role: 'teacher'
    });
    await user.save();
    teacherId = user._id;
    token = jwt.sign({ id: user._id, role: 'teacher' }, JWT_SECRET);
  });

  afterEach(async () => {
    await Course.deleteMany({});
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  test('POST /api/courses debe crear un curso', async () => {
    const res = await request(app)
      .post('/api/courses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Panadería Básica',
        description: 'Aprende a hacer pan.',
        date: '2025-09-01T08:00:00Z',
        duration: 4,
        maxStudents: 15
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.title).toBe('Panadería Básica');
  });
});

