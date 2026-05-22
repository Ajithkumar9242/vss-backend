const router = require('express').Router();
const c = require('./controller');
const { protect, authorize } = require('../../middlewares/auth');

router.use(protect);

/** Parent: get hostel info for their child */
router.get('/my', c.getMyHostel);

router.post('/rooms', authorize('admin', 'super_admin', 'principal'), c.createRoom);
router.get('/rooms', c.getRooms);
router.get('/rooms/:id', c.getRoomById);
router.post('/assign', authorize('admin', 'super_admin', 'principal'), c.assignStudent);
router.delete('/remove/:studentId', authorize('admin', 'super_admin', 'principal'), c.removeStudent);
router.get('/occupancy', c.getOccupancy);

module.exports = router;
