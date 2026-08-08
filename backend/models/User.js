import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  fullName: { type: DataTypes.STRING, allowNull: false, field: 'full_name' },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.TEXT, allowNull: false, field: 'password_hash' },
  role: { type: DataTypes.ENUM('owner', 'manager', 'accountant', 'waiter', 'kitchen', 'bar'), allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: true, field: 'branch_id' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
  salary: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
  bonus: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
  promotion: { type: DataTypes.TEXT, defaultValue: '' },
  lastLogin: { type: DataTypes.DATE, field: 'last_login' },
}, { tableName: 'users', timestamps: true, createdAt: 'created_at', updatedAt: false }) 