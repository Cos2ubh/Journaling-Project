const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const me = require('../controllers/meController');

// Public: authorised by the signed token in the email link
router.get('/unsubscribe', me.unsubscribe);
router.post('/unsubscribe', me.unsubscribe);

router.use(protect);

router.get('/', me.getMe);
router.put('/preferences', me.updatePreferences);
router.post('/pro-interest', me.registerProInterest);
router.get('/activity', me.getActivity);

module.exports = router;