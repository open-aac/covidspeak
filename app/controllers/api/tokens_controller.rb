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
    account = accounts[0]
    check_id = [account.id, GoSecure.nonce('admin_code_checker')].join('_')
    email = accounts[0].settings['email']
    host = "#{request.protocol}#{request.host_with_port}"
    codes = accounts.map do |a|
      {
        url: "#{host}/accounts/#{a.admin_code}/activate/#{check_id}",
        name: a.settings['name'] || "Account created #{a.created_at}"
      }
    end
    # TODO: email code to account email address
    render json: {sent: true, check_id: check_id}
  end

  def check_admin_code
    code = RedisAccess.default.get("admin_code/#{params['check_id']}")
    render json: {ready: !!code, admin_code: code}
  end

  def check_token
    render json: {accesss_token: params['token'], valid: Account.valid_access_token?(params['token'])}
  end
end
