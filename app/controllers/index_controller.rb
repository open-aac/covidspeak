class IndexController < ApplicationController
  def index
    @show_intro = true;
  end

  def room
    render :layout => 'minimal'
  end

  def join
  end

  def bundle
    @bundle = Bundle.find_by_code(params['code'])
  end

  def pending_room
    @room = PendingRoom.find_by_code(params['room_id'])
  end

  def schedule
    @account = Account.find_by_schedule_id(params['schedule_id'])
  end

  def admin
  end

  def account
    @account = Account.find_by_admin_code(params['admin_code'])
  end
  
  def activate_account_code
    @account = Account.find_by_admin_code(params['admin_code'])
    RedisAccess.default.setex("admin_code/#{params['check_id']}", 3.hours.to_i, @account.admin_code) if @account
  end

end
