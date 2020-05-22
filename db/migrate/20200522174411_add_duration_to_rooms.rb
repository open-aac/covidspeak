class AddDurationToRooms < ActiveRecord::Migration[5.2]
  def change
    add_column :rooms, :duration, :integer
    Room.all.each{|r| r.duration = r.settings['duration'] if r.settings && r.settings['duration'] }
  end
end
