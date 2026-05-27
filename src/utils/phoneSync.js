const mongoose = require('mongoose');

/**
 * Normalizes phone numbers to standard 10 digit local format for search/matching.
 * Returns exactly 10 digits if valid, otherwise returns cleaned digits.
 */
function normalizePhone(phone) {
  if (!phone) return '';
  // Strip all non-digit characters
  const cleaned = phone.toString().replace(/\D/g, '');
  // If it starts with 91 and has 12 digits, strip the 91
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return cleaned.substring(2);
  }
  // If it starts with 0 and has 11 digits, strip the 0
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return cleaned.substring(1);
  }
  return cleaned;
}

/**
 * Synchronizes a phone number update across User, Parent, Student, and Admission collections.
 * It identifies all related records based on parentId, studentId, admissionId, userId, or old/new phone matches,
 * and updates them consistently.
 * 
 * @param {Object} params
 * @param {string} [params.parentId] - ID of parent record
 * @param {string} [params.studentId] - ID of student record
 * @param {string} [params.admissionId] - ID of admission record
 * @param {string} [params.userId] - ID of user record
 * @param {string} params.newPhone - The new phone number being set
 * @param {string} [params.oldPhone] - The old phone number (optional)
 */
async function syncPhoneNumbers({ parentId, studentId, admissionId, userId, newPhone, oldPhone }) {
  if (!newPhone) return;
  
  const cleanNew = normalizePhone(newPhone);
  if (cleanNew.length !== 10) {
    console.warn(`[PhoneSync] Skip syncing: New phone '${newPhone}' is not a valid 10-digit number`);
    return;
  }
  
  const User = mongoose.model('User');
  const Parent = mongoose.model('Parent');
  const Student = mongoose.model('Student');
  const Admission = mongoose.model('Admission');
  
  console.log(`[PhoneSync] Starting sync: Parent=${parentId}, Student=${studentId}, Admission=${admissionId}, User=${userId}, newPhone=${cleanNew}, oldPhone=${oldPhone}`);

  try {
    // 1. Resolve old phone and all IDs if not explicitly provided
    let resolvedParentId = parentId;
    let resolvedUserId = userId;
    let resolvedStudentIds = [];
    let resolvedAdmissionIds = [];
    let resolvedOldPhone = oldPhone ? normalizePhone(oldPhone) : null;

    if (resolvedParentId) {
      const p = await Parent.findById(resolvedParentId).lean();
      if (p) {
        if (!resolvedOldPhone) resolvedOldPhone = normalizePhone(p.phone);
        if (!resolvedUserId) resolvedUserId = p.userId;
        if (p.linkedStudents && p.linkedStudents.length) {
          resolvedStudentIds = p.linkedStudents.map(id => id.toString());
        }
      }
    }

    if (studentId) {
      const s = await Student.findById(studentId).lean();
      if (s) {
        if (!resolvedOldPhone) resolvedOldPhone = normalizePhone(s.parentPhone);
        if (!resolvedParentId) resolvedParentId = s.parentId;
        if (s.admissionId) resolvedAdmissionIds.push(s.admissionId.toString());
        if (!resolvedStudentIds.includes(studentId.toString())) {
          resolvedStudentIds.push(studentId.toString());
        }
      }
    }

    if (admissionId) {
      const adm = await Admission.findById(admissionId).lean();
      if (adm) {
        if (!resolvedOldPhone) resolvedOldPhone = normalizePhone(adm.parentPhone);
        // Find student linked to this admission
        const s = await Student.findOne({ admissionId }).lean();
        if (s) {
          if (!resolvedParentId) resolvedParentId = s.parentId;
          if (!resolvedStudentIds.includes(s._id.toString())) {
            resolvedStudentIds.push(s._id.toString());
          }
        }
      }
    }

    if (resolvedUserId) {
      const u = await User.findById(resolvedUserId).lean();
      if (u) {
        if (!resolvedOldPhone) resolvedOldPhone = normalizePhone(u.phone);
        if (u.role === 'parent' && u.referenceId && !resolvedParentId) {
          resolvedParentId = u.referenceId;
        }
      }
    }

    // If we still don't have resolvedOldPhone, we can't search by phone, but we can search by IDs.
    const searchOldPhone = resolvedOldPhone || '';

    // 2. Perform Cascaded Updates

    // Update User record (only for parent accounts linked to this phone/user)
    let userQuery = null;
    if (resolvedUserId) {
      userQuery = { _id: resolvedUserId };
    } else if (searchOldPhone) {
      userQuery = { phone: { $in: [searchOldPhone, '91' + searchOldPhone, '+91' + searchOldPhone] }, role: 'parent' };
    }

    if (userQuery) {
      const updatedUser = await User.findOneAndUpdate(
        userQuery,
        { $set: { phone: cleanNew } },
        { new: true }
      );
      if (updatedUser) {
        console.log(`[PhoneSync] Updated User ID: ${updatedUser._id} phone to ${cleanNew}`);
        if (!resolvedUserId) resolvedUserId = updatedUser._id;
      }
    }

    // Update Parent record
    let parentQuery = null;
    if (resolvedParentId) {
      parentQuery = { _id: resolvedParentId };
    } else if (searchOldPhone) {
      parentQuery = { phone: { $in: [searchOldPhone, '91' + searchOldPhone, '+91' + searchOldPhone] } };
    } else if (resolvedUserId) {
      parentQuery = { userId: resolvedUserId };
    }

    if (parentQuery) {
      const updatedParent = await Parent.findOneAndUpdate(
        parentQuery,
        { $set: { phone: cleanNew } },
        { new: true }
      );
      if (updatedParent) {
        console.log(`[PhoneSync] Updated Parent ID: ${updatedParent._id} phone to ${cleanNew}`);
        if (!resolvedParentId) resolvedParentId = updatedParent._id;
        if (updatedParent.linkedStudents && updatedParent.linkedStudents.length) {
          updatedParent.linkedStudents.forEach(id => {
            if (!resolvedStudentIds.includes(id.toString())) {
              resolvedStudentIds.push(id.toString());
            }
          });
        }
      }
    }

    // Update Student records
    // Any student matching: resolvedStudentIds, OR matching parentId, OR matching parentPhone = oldPhone
    const studentQueries = [];
    if (resolvedStudentIds.length) {
      studentQueries.push({ _id: { $in: resolvedStudentIds } });
    }
    if (resolvedParentId) {
      studentQueries.push({ parentId: resolvedParentId });
    }
    if (searchOldPhone) {
      studentQueries.push({ parentPhone: { $in: [searchOldPhone, '91' + searchOldPhone, '+91' + searchOldPhone] } });
    }

    if (studentQueries.length) {
      const matchedStudents = await Student.find({ $or: studentQueries }).select('_id admissionId parentPhone').lean();
      if (matchedStudents.length) {
        const studentIdsToUpdate = matchedStudents.map(s => s._id);
        const result = await Student.updateMany(
          { _id: { $in: studentIdsToUpdate } },
          { $set: { parentPhone: cleanNew } }
        );
        console.log(`[PhoneSync] Updated ${result.modifiedCount} Student records with parentPhone=${cleanNew}`);
        
        matchedStudents.forEach(s => {
          if (s.admissionId && !resolvedAdmissionIds.includes(s.admissionId.toString())) {
            resolvedAdmissionIds.push(s.admissionId.toString());
          }
        });
      }
    }

    // Update Admission records
    // Any admission matching: resolvedAdmissionIds, OR matching parentPhone = oldPhone
    const admissionQueries = [];
    if (resolvedAdmissionIds.length) {
      admissionQueries.push({ _id: { $in: resolvedAdmissionIds } });
    }
    if (searchOldPhone) {
      admissionQueries.push({ parentPhone: { $in: [searchOldPhone, '91' + searchOldPhone, '+91' + searchOldPhone] } });
    }

    if (admissionQueries.length) {
      const result = await Admission.updateMany(
        { $or: admissionQueries },
        { $set: { parentPhone: cleanNew } }
      );
      console.log(`[PhoneSync] Updated ${result.modifiedCount} Admission records with parentPhone=${cleanNew}`);
    }

    console.log(`[PhoneSync] Synchronization successfully completed.`);
  } catch (error) {
    console.error(`[PhoneSync] Error syncing phone numbers:`, error.stack || error.message);
  }
}

module.exports = {
  normalizePhone,
  syncPhoneNumbers
};
