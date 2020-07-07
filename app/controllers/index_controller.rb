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
end
