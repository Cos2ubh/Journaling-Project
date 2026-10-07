const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const me = require('../controllers/meController');

router.use(protect);

router.get('/', me.getMe);
router.put('/preferences', me.updatePreferences);
router.post('/pro-interest', me.registerProInterest);
router.get('/activity', me.getActivity);

module.exports = router;