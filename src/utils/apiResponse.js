/**
 * Standardized API response helper.
 * All responses follow: { success, data, message }
 */
class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      data,
      message,
    });
  }

  static created(res, data = null, message = 'Created successfully') {
    return res.status(201).json({
      success: true,
      data,
      message,
    });
  }

  static error(res, message = 'Something went wrong', statusCode = 500, errors = null, code = null) {
    const response = {
      success: false,
      data: errors,
      message,
    };
    if (code) {
      response.code = code;
    }
    return res.status(statusCode).json(response);
  }

  static paginated(res, data, pagination, message = 'Success') {
    return res.status(200).json({
      success: true,
      data,
      pagination,
      message,
    });
  }
}

module.exports = ApiResponse;
