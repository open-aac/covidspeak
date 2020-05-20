class Api::TokensController < ApplicationController
  def token
    token = Account.access_token(params['code'])
    if token
      render json: {access_token: token}
    else
      api_error(400, {error: 'invalid token'})
    end
  end

  def check_token
    render json: {accesss_token: params['token'], valid: Account.valid_access_token?(params['token'])}
  end
end
