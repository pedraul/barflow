import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('Subscription', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  businessId: { type: DataTypes.UUID, allowNull: true, field: 'business_id' },
  status: { type: DataTypes.STRING, defaultValue: 'active' },
  plan: { type: DataTypes.STRING, defaultValue: 'Pro' },
  startDate: { type: DataTypes.DATE, field: 'start_date' },
  currentPeriodEnd: { type: DataTypes.DATE, field: 'current_period_end' },
  expirationDate: { type: DataTypes.DATE, field: 'expiration_date' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
  cancelledAt: { type: DataTypes.DATE, field: 'cancelled_at' },
}, { tableName: 'subscriptions', timestamps: true, createdAt: 'created_at', updatedAt: false })