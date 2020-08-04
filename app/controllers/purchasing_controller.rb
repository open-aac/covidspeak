class PurchasingController < ApplicationController
  def pricing
  end

  def initiate
    join_code = params['join_code']
    if join_code.blank?
      join_code = params['contact_name'].to_s.downcase.gsub(/[^A-za-z0-9]/, '')
      if join_code.length < 5
        join_code = join_code + GoSecure.nonce('join_code_suffix')
      end
    end
    host = "#{request.protocol}#{request.host_with_port}"

    session_id = Purchasing.purchase_prep({
      contact_email: params['contact_email'],
      contact_name: params['contact_name'],
      quantity: [1, params['quantity'].to_i].max,
      join_code: join_code,
      name: params['name'],
      success_url: "#{host}/purchasing/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "#{host}/pricing?canceled=true"
    })
    render json: {ready: !!session_id, session_id: session_id}
  end

  def cancel
    account = Account.find_by_admin_code(params['admin_code'])
    return api_error(400, {error: 'invalid account code'}) if !account
    return api_error(400, {error: 'no subscription found'}) if !account.settings['subscription'] || !account.settings['subscription']['subscription_id']
      
    res = Purchasing.cancel_subscription(account, account.settings['subscription']['customer_id'], account.settings['subscription']['subscription_id'])
    if res
      account.reload
      account.settings['subscription']['cancel_reason'] = params['reason']
      account.save
    end
    return api_error(400, {error: 'cancel failed'}) unless res

    render json: {canceled: true}
  end

  def confirm
    account = Purchasing.confirm_purchase(params['session_id'])
    return api_error(400, {error: 'confirmation failed'}) unless account
    render json: {confirmed: true, account_id: account.id, admin_code: account.admin_code, source: account.settings['subscription']['last_purchase_update_source']}
  end

  def success
  end

  def update_billing
    host = "#{request.protocol}#{request.host_with_port}"
    account = Account.find_by_admin_code(params['admin_code'])
    return api_error(400, {error: 'invalid account code'}) unless account
    return api_error(400, {error: 'no subscription found'}) unless account && account.settings['subscription'] && account.settings['subscription']['subscription_id']
  
    session_id = Purchasing.purchase_modify({
      contact_email: account.settings['contact_email'],
      customer_id: account.settings['subscription']['customer_id'],
      quantity: [1, account.settings['max_concurrent_rooms']].compact.max,
      subscription_id: account.settings['subscription']['subscription_id'],
      success_url: "#{host}/purchasing/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "#{host}/accounts/#{account.admin_code}"
    })
    render json: {ready: !!session_id, session_id: session_id}
  end
end
