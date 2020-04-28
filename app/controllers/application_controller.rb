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
end
