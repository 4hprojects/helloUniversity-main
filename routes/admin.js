const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');
const User = require('../models/User');

// GET: Admin Dashboard - View all users
router.get('/admin/users', isAdmin, async (req, res) => {
    try {
        console.log('\n👤 [ADMIN] Fetching all users');
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        console.log('✅ [ADMIN] Found', users.length, 'users');
        users.forEach(user => {
            console.log(`  - ${user.email} (Role: ${user.role}, Verified: ${user.isVerified})`);
        });
        res.render('admin/users', { users });
    } catch (error) {
        console.error('❌ [ADMIN] Error fetching users:', error.message);
        res.render('error', { message: 'Failed to fetch users' });
    }
});

// GET: Admin Dashboard - View single user details
router.get('/admin/users/:id', isAdmin, async (req, res) => {
    try {
        console.log('\n👤 [ADMIN] Fetching user details for ID:', req.params.id);
        const user = await User.findById(req.params.id).select('-password');
        
        if (!user) {
            console.log('❌ [ADMIN] User not found:', req.params.id);
            return res.render('error', { message: 'User not found' });
        }

        console.log('✅ [ADMIN] User found:', user.email);
        res.render('admin/user-detail', { user });
    } catch (error) {
        console.error('❌ [ADMIN] Error fetching user:', error.message);
        res.render('error', { message: 'Failed to fetch user' });
    }
});

// POST: Toggle admin role
router.post('/admin/users/:id/toggle-admin', isAdmin, async (req, res) => {
    try {
        console.log('\n👤 [ADMIN] Toggle admin role for ID:', req.params.id);
        const user = await User.findById(req.params.id);
        
        if (!user) {
            console.log('❌ [ADMIN] User not found:', req.params.id);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const oldRole = user.role;
        user.role = user.role === 'admin' ? 'user' : 'admin';
        await user.save();

        console.log('✅ [ADMIN] Role changed for', user.email, ':', oldRole, '->', user.role);

        res.json({ 
            success: true, 
            message: `User role changed to ${user.role}`,
            role: user.role
        });
    } catch (error) {
        console.error('❌ [ADMIN] Error toggling admin status:', error.message);
        res.status(500).json({ success: false, message: 'Failed to update user' });
    }
});

// POST: Delete user
router.post('/admin/users/:id/delete', isAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        console.log('\n👤 [ADMIN] Delete user attempt for ID:', userId);

        // Prevent admin from deleting themselves
        if (userId === req.session.userId.toString()) {
            console.log('⚠️ [ADMIN] Admin tried to delete their own account');
            return res.json({ 
                success: false, 
                message: 'Cannot delete your own account' 
            });
        }

        const user = await User.findByIdAndDelete(userId);
        
        if (!user) {
            console.log('❌ [ADMIN] User not found for deletion:', userId);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        console.log('✅ [ADMIN] User deleted:', user.email);

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('❌ [ADMIN] Error deleting user:', error.message);
        res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
});

module.exports = router;