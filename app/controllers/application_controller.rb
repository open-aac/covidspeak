class ApplicationController < ActionController::Base
  skip_before_action :verify_authenticity_token
  before_action :set_app_headers

  def set_app_headers
    headers['Access-Control-Allow-Origin'] = '*'
    headers['Access-Control-Allow-Methods'] = 'POST, GET, PUT, OPTIONS'
#    headers['Access-Control-Max-Age'] = "1728000"      
    headers['Feature-Policy'] = 'camera *; autoplay *; display-capture *; fullscreen *';
  end

  def api_error(code, res)
    if res.is_a?(Hash)
      render json: res.to_json, status: code
    else
      render text: res, status: code
    end
  end

  def require_token
    token = params['access_token']
    if request.headers['Authorization']
      token ||= request.headers['Authorization'].sub(/^Bearer\s+/, '')
    end
    if !Account.valid_access_token?(token)
      api_error(404, {error: 'no valid token'})
      return false
    else
      @admin_token = true
    end
  end

  def require_admin_code
    if params['admin_code']
      @allowed_account = Account.find_by_admin_code(params['admin_code'])
      return false unless @account
    else
      return require_token
    end
    require_admin_code    
  end
end
