class Api::TokensController < ApplicationController
  def token
    token = Account.access_token(params['code'])
    if token
      render json: {access_token: token}
    else
      api_error(400, {error: 'invalid token'})
    end
  end

  def email_admin_code
    # TODO: throttling
    account = Account.find_by_code(params['code'])
    accounts = [account].compact
    if !account && params['code'].match(/@/)
      accounts = Accounts.where(email_hash: Account.generate_email_hash(params['code']))
    end
    return api_error(400, {error: 'invalid code'}) unless accounts.length > 0
    email = accounts[0].settings['email']
    codes = accounts.map(&:admin_code)
    # TODO: email code to account email address
    render json: {sent: true}
  end

  def check_token
    render json: {accesss_token: params['token'], valid: Account.valid_access_token?(params['token'])}
  end
end
