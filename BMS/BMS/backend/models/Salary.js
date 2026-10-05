import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('Salary', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING },
  amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  method: { type: DataTypes.STRING, allowNull: false },
  actor: { type: DataTypes.STRING, allowNull: false },
  paidAt: { type: DataTypes.DATE, field: 'paid_at' },
}, { tableName: 'salary_payments', timestamps: true, createdAt: 'paid_at', updatedAt: false })
