import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('AuditLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
  actorName: { type: DataTypes.STRING, defaultValue: 'system', field: 'actor_name' },
  action: { type: DataTypes.TEXT, allowNull: false },
  entityType: { type: DataTypes.STRING, field: 'entity_type' },
  entityId: { type: DataTypes.UUID, field: 'entity_id' },
  targetModule: { type: DataTypes.STRING, field: 'target_module' },
  ipAddress: { type: DataTypes.STRING, field: 'ip_address' },
  metadata: { type: DataTypes.JSONB, defaultValue: {} },
}, { tableName: 'audit_logs', timestamps: true, createdAt: 'created_at', updatedAt: false })