const router = require('express').Router();
const c = require('./controller');
const { protect } = require('../../middlewares/auth');

router.use(protect);

/** Parent: get hostel info for their child */
router.get('/my', c.getMyHostel);

router.post('/rooms', c.createRoom);
router.get('/rooms', c.getRooms);
router.get('/rooms/:id', c.getRoomById);
router.post('/assign', c.assignStudent);
router.delete('/remove/:studentId', c.removeStudent);
router.get('/occupancy', c.getOccupancy);

module.exports = router;
