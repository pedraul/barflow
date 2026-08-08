// backend/middleware/checkSubscription.js
const { Subscription, Role } = require('../models');
const { Op } = require('sequelize');

const checkSubscription = async (req, res, next) => {
  try {
    // 1. Skip check if user is not logged in yet (or on public/auth routes)
    if (!req.user || !req.user.businessId) {
      return next();
    }

    const { businessId, roleId } = req.user;

    // 2. Query database for an active subscription for this business
    const activeSubscription = await Subscription.findOne({
      where: {
        business_id: businessId,
        status: 'ACTIVE',
        payment_status: 'PAID',
        expiry_date: {
          [Op.gte]: new Date() // Expiry date must be today or in the future
        }
      }
    });

    // 3. If there is an active subscription, proceed normally
    if (activeSubscription) {
      req.hasActiveSubscription = true;
      return next();
    }

    // No active subscription!
    req.hasActiveSubscription = false;

    // 4. Fetch the user's role to determine blocking behavior
    const userRole = await Role.findByPk(roleId);
    const isOwner = userRole && userRole.role_name === 'Owner';

    // Allow owners to access subscription endpoints so they can actually renew and pay
    if (isOwner && req.originalUrl.includes('/api/subscriptions')) {
      return next();
    }

    // Block all other requests
    return res.status(403).json({
      error: 'Subscription expired',
      message: isOwner 
        ? 'Your subscription has expired. Please renew your plan to reactivate the system.'
        : 'Please wait. The business subscription has expired. Please contact the administrator/owner.',
      isOwner: isOwner
    });

  } catch (error) {
    console.error('Error checking subscription status:', error);
    return res.status(500).json({ error: 'Internal server error checking subscription.' });
  }
};

module.exports = checkSubscription;