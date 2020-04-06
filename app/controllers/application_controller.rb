class ApplicationController < ActionController::Base
  skip_before_action :verify_authenticity_token

  def api_error(code, res)
    if res.is_a?(Hash)
      render json: res.to_json, status: code
    else
      render text: res, status: code
    end
  end
end
