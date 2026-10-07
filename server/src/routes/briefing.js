const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const briefing = require('../controllers/briefingController');

router.use(protect);

router.get('/today', briefing.getToday);
router.post('/today/answers', briefing.answer);
router.post('/today/done', briefing.done);

module.exports = router;