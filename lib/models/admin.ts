import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Admin =
  mongoose.models.adminSchema || mongoose.model('Admin', adminSchema);

export default Admin;
