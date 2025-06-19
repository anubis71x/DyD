import mongoose from 'mongoose';

const coinSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  coins: { type: Number, required: true },
  usdValue: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Coin = mongoose.models.Coin || mongoose.model('Coin', coinSchema);

export default Coin;
