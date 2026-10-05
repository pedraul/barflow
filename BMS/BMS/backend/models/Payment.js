import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('Payment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  method: { type: DataTypes.ENUM('cash', 'mtn_momo', 'airtel_money', 'pos'), allowNull: false },
  amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  reference: { type: DataTypes.STRING },
  paidAt: { type: DataTypes.DATE, field: 'paid_at' },
}, { tableName: 'payments', timestamps: true, createdAt: 'paid_at', updatedAt: false })
