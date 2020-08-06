class Api::AccountsController < ApplicationController
  before_action :require_token, :except => [:join_code, :show, :update, :purchasing_event]
  before_action :require_admin_code, :only => [:show, :update]
  
  def index
    list = []
    accounts = {}
    check_account_ids = []
    Account.all.each do |account|
      accounts[account.id] = [account.code, account.settings['name']]
      list << account_json(account)
      check_account_ids << account.id # unless account.settings['short_rooms']
    end
    rooms_list = []
    rooms = Room.where(account_id: check_account_ids).where(['created_at > ?', 4.weeks.ago]).order('created_at DESC').limit(50)
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
    account.settings['free_account'] = true
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

  def purchasing_event
    res = Purchasing.subscription_event(request)
    render json: res[:data], :status => res[:status]
  end

  def feedback
    feedback = UserFeedback.order('ID DESC').limit(50)
    feedback = feedback.select{|f| f.created_at > 6.months.ago }
    json = feedback.map do |entry|
      {
        created: entry.created_at.to_i,
        stars: entry.settings['stars'],
        feedback: entry.settings['feedback'],
        device: "#{entry.settings['system']}.#{entry.settings['browser']}#{entry.settings['mobile'] ? '.mobile' : ''}",
      }
    end
    render json: {feedback: json}
  end

  def join_code
    # TODO: throttle
    account = Account.find_by_code(params['join_code'])
    if account && !account.settings['short_rooms']
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
    account = nil
    if @allowed_account
      account = @allowed_account if @allowed_account.id.to_s == params['id']
    else
      account = Account.find_by(id: params['id'])
    end
    return api_error(404, {error: 'not found', id: params['id']}) unless account
    res = account_json(account, true)
    render json: {account: res}
  end

  def update
    account = nil
    if @allowed_account
      account = @allowed_account if @allowed_account.id == params['id']
    else
      account = Account.find_by(id: params['id'])
    end
    return api_error(404, {error: 'not found', id: params['id']}) unless account
    # TODO: update and stuff
    # allow updating name, contact info, join code (check uniqueness)
    # default grid layouts
    res = account_json(account, true)
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
      :invites => (room.settings['remote_invites'] || 0),
      :started => room.settings['started_at'] || room.created_at.to_i,
      :ended => room.settings['ended_at']
    }
    if room.settings['user_configs']
      res[:configs] = []
      res[:actions] = []
      list = room.settings['user_configs'].to_a.sort_by{|k, c| c['timestamp']}
      list.each do |id, opts|
        ip_hash = (opts['ip_hash'] || opts['partial_ip'] || '0').sub(/\.0\.0$/, '')
        res[:configs] << "#{opts['system']}.#{opts['browser']}#{opts['mobile'] ? '.mobile' : ''}.#{ip_hash}"
        res[:actions] << {reactions: opts['reactions'], buttons: opts['buttons'], minutes_heard: opts['minutes_heard']}
      end
    end
    res
  end

  def account_json(account, include_extras=false)
    account.generate_defaults
    meter_ts = ((account.settings['subscription'] || {})['last_meter_update'] || {})['timestamp']
    last_meter = meter_ts && Time.at(meter_ts).utc.iso8601
    res = {
      id: account.id,
      code: account.code,
      created_at: account.created_at.iso8601,
      name: account.settings['name'] || account.code,
      type: account.backend_type,
      contact_name: account.settings['contact_name'],
      contact_email: account.settings['contact_email'],
      past_due: !!account.settings['past_due'],
      payment_type: account.paid_account? ? 'paid' : 'free',
      demo: !!account.settings['short_rooms'],
      purchase_summary: (account.settings['subscription'] || {})['purchase_summary'],
      last_meter_update: last_meter,
      current_month_meter: !!(last_meter && last_meter > Time.now.beginning_of_month.utc.iso8601),
      can_start_room: account.can_start_room?,
      archived: account.archived,
      last_room_at: account.settings['last_room_at'],
      recent_rooms_approx: account.settings['recent_rooms'] || 0,
      sub_codes: account.settings['sub_codes'],
      max_concurrent_rooms: account.settings['max_concurrent_rooms'] || 1,
      max_concurrent_rooms_per_user: account.settings['max_concurrent_rooms_per_user'],
      max_daily_rooms: account.settings['max_daily_rooms'],
      max_daily_rooms_per_user: account.settings['max_daily_rooms_per_user'],
      max_monthly_rooms: account.settings['max_monthly_rooms'],
      max_monthly_rooms_per_user: account.settings['max_monthly_rooms_per_user'],
    }

    if @admin_token
      res[:address] = account.settings['address']
      res[:source] = account.settings['source']
      res[:history] = account.month_history
    end

    if include_extras
      res[:sub_ids] = account.settings['codes'] || {}
      res[:rooms] = []
      res[:admin_code] = account.admin_code
      res[:cancel_reason] = (account.settings['subscription'] || {})['cancel_reason']
      res[:history] = account.month_history
      rooms = Room.where(account_id: account.id).where(['created_at > ?', 6.months.ago]).order('id DESC').limit(20)
      rooms.each do |room|
        res[:rooms] << room_json(room)
      end
    end
    res
  end
end
