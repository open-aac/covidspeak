class Api::AccountsController < ApplicationController
  before_action :require_token
  
  def index
    list = []
    Account.all.each do |account|
      list << account_json(account)
    end
    render json: {accounts: list}
  end

  def create
    account = Account.new
    account.generate_defaults
    account.code = params['code'].to_s
    account.settings['name'] = params['name'].to_s
    account.settings['contact_name'] = params['contact_name'].to_s
    account.settings['contact_email'] = params['contact_email'].to_s
    if params['server_code']
      account.copy_server_from(params['server_code'])
    end
    rooms = params['max_concurrent_rooms'].to_i
    account.settings['max_concurrent_rooms'] = rooms if rooms > 0
    account.save!
    render json: {account: account_json(account)}
  end

  def sub_id
    account = Account.find_by(id: params['account_id'])
    begin
      sub_id = params['sub_id']
      sub_id = nil if sub_id.blank?
      code = account.generate_sub_id!(sub_id)
      render json: {account_id: params['account_id'], sub_id: code.split(/\./)[1]}
    rescue => e
      api_error(400, {error: 'code generation failed'})
    end
  end

  def show
    account = Account.find_by(id: params['id'])
    return api_error(404, {error: 'not found', id: params['id']}) unless account
    res = account_json(account)
    res[:sub_ids] = account.settings['codes'] || {}
    res[:rooms] = []
    rooms = Room.where(account_id: account.id).where(['created_at > ?', 4.weeks.ago])
    rooms.each do |room|
      room.settings ||= {}
      next unless room.settings['duration'] && room.settings['duration'] > 0
      res[:rooms] << {
        :sub_id => room.settings['account_sub_id'],
        :duration => room.settings['duration'],
        :started => room.settings['started_at'],
        :ended => room.settings['ended_at']
      }
    end
    render json: {account: res}
  end

  def account_json(account)
    {
      id: account.id,
      code: account.code,
      name: account.settings['name'] || account.code,
      type: account.backend_type,
      contact_name: account.settings['contact_name'],
      contact_email: account.settings['contact_email'],
      source: account.settings['source'],
      address: account.settings['address'],
      last_room_at: account.settings['last_room_at'],
      recent_rooms_approx: account.settings['recent_rooms'] || 0,
      sub_codes: account.settings['sub_codes'],
      max_concurrent_rooms: account.settings['max_concurrent_rooms'],
      max_concurrent_rooms_per_user: account.settings['max_concurrent_rooms_per_user'],
      max_daily_rooms: account.settings['max_daily_rooms'],
      max_daily_rooms_per_user: account.settings['max_daily_rooms_per_user'],
      max_monthly_rooms: account.settings['max_monthly_rooms'],
      max_monthly_rooms_per_user: account.settings['max_monthly_rooms_per_user'],
    }
  end
end
