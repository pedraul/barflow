import { DataTypes } from 'sequelize'
import sequelize from './sequelize.js'

export default sequelize.define('Notification', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  senderId: { type: DataTypes.UUID, allowNull: false, field: 'sender_id' },
  receiverId: { type: DataTypes.UUID, allowNull: true, field: 'receiver_id' },
  message: { type: DataTypes.TEXT, allowNull: false },
  isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_read' },
  parentId: { type: DataTypes.UUID, allowNull: true, field: 'parent_id' },
}, { tableName: 'notifications', timestamps: true, createdAt: 'created_at', updatedAt: false })
