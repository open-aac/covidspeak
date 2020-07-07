class Api::AccountsController < ApplicationController
  before_action :require_token, :except => [:join_code]
  
  def index
    list = []
    accounts = {}
    Account.all.each do |account|
      accounts[account.id] = [account.code, account.settings['name']]
      list << account_json(account)
    end
    rooms_list = []
    rooms = Room.where(['created_at > ?', 4.weeks.ago]).order('created_at DESC').limit(20)
    rooms.each do |room|
      code, name = accounts[room.account_id] || []
      rooms_list << room_json(room, code, name)
    end

    render json: {accounts: list, recent_rooms: rooms_list}
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

  def join_code
    account = Account.find_by_code(params['join_code'])
    if account
      render json: {account: {schedule_id: account.schedule_id}}
    else
      api_error(400, {error: 'invalid join code'})
    end
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
      res[:rooms] << room_json(room)
    end
    render json: {account: res}
  end

  def room_json(room, code=nil, name=nil)
    room.generate_defaults
    res = {
      :account_code => code,
      :account_name => name,
      :account_id => room.account_id,
      :partner_status => room.settings['partner_status'],
      :total_users => (room.settings['active_user_ids'] || []).uniq.length,
      :sub_id => room.settings['account_sub_id'],
      :duration => room.duration || 0,
      :started => room.settings['started_at'] || room.created_at.to_i,
      :ended => room.settings['ended_at']
    }
    if room.settings['user_configs']
      res[:configs] = []
      list = room.settings['user_configs'].to_a.sort_by{|k, c| c['timestamp']}
      list.each do |id, opts|
        ip_hash = (opts['ip_hash'] || opts['partial_ip'] || '0').sub(/\.0\.0$/, '')
        res[:configs] << "#{opts['system']}.#{opts['browser']}#{opts['mobile'] ? '.mobile' : ''}.#{ip_hash}"
      end
    end
    res
  end
  def account_json(account)
    account.generate_defaults
    {
      id: account.id,
      code: account.code,
      name: account.settings['name'] || account.code,
      type: account.backend_type,
      contact_name: account.settings['contact_name'],
      contact_email: account.settings['contact_email'],
      archived: account.archived,
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
